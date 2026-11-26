#!/usr/bin/env python3
"""
Move top-level declarations of a TS/TSX module into sibling files, verbatim,
with imports computed from what each moved body references.

  python3 split-file.py <source.tsx> <NewFile.tsx>=Sym1,Sym2 [<Other.ts>=Sym3 ...] [--export-from-source]

- A declaration is a column-0 `function|const|let|class|type|interface|enum`
  (optionally exported) plus the comment block right above it, up to the next
  column-0 statement.
- A new file imports: the source's imports its bodies reference, symbols moved
  to sibling new files, and (with --export-from-source) symbols that stay in the
  source, which then get exported. Without the flag, a moved body that references
  a symbol staying behind is an error: move that symbol too.
- The source gets one import line per new file for the moved symbols it still uses.

Run the type checker afterwards; remove any import it reports unused. Nothing is
ever reformatted: code moves byte for byte.
"""
import os
import re
import sys

EXPORT_FROM_SOURCE_FLAG = '--export-from-source'
TYPE_KINDS = ('type', 'interface')

IMPORT_STATEMENT = re.compile(
    r"^import\s+(type\s+)?(\{[^}]*\}|\*\s+as\s+[\w$]+|[\w$]+)(?:\s*,\s*\{([^}]*)\})?\s+from\s+['\"]([^'\"]+)['\"]\s*;?\n",
    re.M | re.S,
)
DECLARATION = re.compile(
    r"^(export\s+)?(default\s+)?(async\s+)?(function|const|let|var|class|type|interface|enum)\s+([\w$]+)",
    re.M,
)
COLUMN_ZERO_STATEMENT = re.compile(r'[A-Za-z_$@/]')
EXPORT_PREFIX = re.compile(r'^export\s', re.M)
ADD_EXPORT = re.compile(r'^(async\s+)?(function|const|let|class|type|interface|enum)\s', re.M)
BLOCK_COMMENT = re.compile(r'/\*.*?\*/', re.S)
LINE_COMMENT = re.compile(r'(?m)^\s*//.*$|(?<=[\s;{(])//(?![^\n]*[\'"`][^\n]*$).*$')
EXTRA_BLANK_LINES = re.compile(r'\n{3,}')
IMPORT_BLOCK_ENTRY = re.compile(
    r"^import[^\n]*(?:\n(?!import)[^\n]*)*?from\s+['\"][^'\"]+['\"]\s*;?\n|^import\s+['\"][^'\"]+['\"]\s*;?\n",
    re.M,
)
COMMENT_LINE_PREFIXES = ('//', ' *', '/*', '*/')

DEFAULT_IMPORT = True
NAMESPACE_IMPORT = 'ns'


def parse_imports(src):
    """Every imported binding as (local, original, source, is_type, kind)."""
    bindings = []
    for match in IMPORT_STATEMENT.finditer(src):
        is_type_import = bool(match.group(1))
        names, extra, source = match.group(2), match.group(3), match.group(4)

        def add(block):
            if block.startswith('{'):
                for part in block.strip('{}').split(','):
                    part = part.strip()
                    if not part:
                        continue
                    is_type = part.startswith('type ')
                    part = part.replace('type ', '', 1)
                    alias = [x.strip() for x in part.split(' as ')]
                    bindings.append((alias[-1], alias[0], source, is_type_import or is_type, False))
            elif block.startswith('*'):
                bindings.append((block.split(' as ')[1].strip(), '*', source, is_type_import, NAMESPACE_IMPORT))
            else:
                bindings.append((block.strip(), block.strip(), source, is_type_import, DEFAULT_IMPORT))

        add(names)
        if extra:
            add('{' + extra + '}')
    return bindings


def is_comment_line(line):
    return line.startswith(COMMENT_LINE_PREFIXES) or line.strip() == '*/'


def declarations(src):
    """[(name, start, end, kind)] for every top-level declaration; a comment block attaches downward."""
    lines = src.split('\n')
    count = len(lines)
    starts = []
    for i, line in enumerate(lines):
        match = DECLARATION.match(line)
        if match and not line.startswith('import'):
            starts.append((i, match.group(5), match.group(4)))

    result = []
    for i, name, kind in starts:
        start = i
        while start > 0 and is_comment_line(lines[start - 1]):
            start -= 1

        # The declaration ends at the next column-0 statement or comment; a call
        # such as `registerWidget({...})` is a boundary too.
        end = i + 1
        while end < count and not COLUMN_ZERO_STATEMENT.match(lines[end]):
            end += 1
        while end > i + 1 and lines[end - 1].strip() == '':
            end -= 1

        result.append((name, start, end, kind))
    return result


def strip_comments(body):
    return LINE_COMMENT.sub('', BLOCK_COMMENT.sub('', body))


def references(body, name):
    """Whether `body` uses `name`: not as a member access (`obj.name`), but a spread (`...name`) counts."""
    pattern = r'(?<![\w$\'"])(?<![^.]\.)' + re.escape(name) + r'(?![\w$])'
    return re.search(pattern, strip_comments(body)) is not None


def module_specifier(file_name):
    return './' + os.path.splitext(file_name)[0]


def import_line(default, namespace, names, source):
    parts = []
    if default:
        parts.append(default)
    if namespace:
        parts.append('* as ' + namespace)
    if names:
        parts.append('{ ' + ', '.join(names) + ' }')
    return f"import {', '.join(parts)} from '{source}'"


def parse_plan(args):
    plan = {}
    for arg in args:
        file_name, symbols = arg.split('=')
        plan[file_name] = [s.strip() for s in symbols.split(',') if s.strip()]
    return plan


def main():
    positional = [a for a in sys.argv[1:] if not a.startswith('--')]
    export_from_source = EXPORT_FROM_SOURCE_FLAG in sys.argv
    path = positional[0]
    plan = parse_plan(positional[1:])

    src = open(path).read()
    lines = src.split('\n')
    imports = parse_imports(src)
    by_name = {decl[0]: decl for decl in declarations(src)}

    def type_aware(name):
        return ('type ' + name) if by_name[name][3] in TYPE_KINDS else name

    moved = {}
    for file_name, symbols in plan.items():
        for symbol in symbols:
            if symbol not in by_name:
                sys.exit(f'no top-level declaration named {symbol} in {path}')
            moved[symbol] = file_name

    all_names = set(by_name)
    source_dir = os.path.dirname(path)
    source_base = os.path.basename(path)
    new_files = {}

    for file_name, symbols in plan.items():
        chunks = []
        for symbol in symbols:
            _name, start, end, _kind = by_name[symbol]
            text = '\n'.join(lines[start:end]).rstrip('\n') + '\n'
            if not EXPORT_PREFIX.search(text):
                text = ADD_EXPORT.sub(r'export \1\2 ', text, count=1)
            chunks.append(text)
        body = '\n'.join(chunks)

        by_source = {}
        for local, original, source, is_type, kind in (entry for entry in imports if references(body, entry[0])):
            group = by_source.setdefault(source, {'default': None, 'ns': None, 'names': []})
            if kind == NAMESPACE_IMPORT:
                group['ns'] = local
            elif kind:
                group['default'] = local
            else:
                spelled = original if original == local else f'{original} as {local}'
                group['names'].append(('type ' if is_type else '') + spelled)

        header = [import_line(g['default'], g['ns'], g['names'], source) for source, g in by_source.items()]

        siblings = {}
        stays = []
        for name in all_names:
            if name in symbols or not references(body, name):
                continue
            if name in moved:
                siblings.setdefault(moved[name], []).append(name)
            else:
                stays.append(name)

        for sibling, names in siblings.items():
            header.append(f"import {{ {', '.join(type_aware(n) for n in sorted(names))} }} from '{module_specifier(sibling)}'")

        if stays:
            if not export_from_source:
                sys.exit(f'{file_name}: references {stays} which stay in {source_base} — move them too or pass {EXPORT_FROM_SOURCE_FLAG}')
            header.append(f"import {{ {', '.join(type_aware(n) for n in sorted(stays))} }} from '{module_specifier(source_base)}'")
            for name in stays:
                _n, start, end, _k = by_name[name]
                for i in range(start, end):
                    if DECLARATION.match(lines[i]) and not lines[i].startswith('export'):
                        lines[i] = 'export ' + lines[i]
                        break

        new_files[file_name] = '\n'.join(header) + '\n\n' + body

    # Rewrite the source: drop moved declarations bottom-up, then add imports.
    for name in sorted(moved, key=lambda n: -by_name[n][1]):
        _n, start, end, _k = by_name[name]
        del lines[start:end]
    rewritten = EXTRA_BLANK_LINES.sub('\n\n', '\n'.join(lines))

    added = []
    for file_name, symbols in plan.items():
        still_used = [s for s in symbols if references(rewritten, s)]
        if still_used:
            added.append(f"import {{ {', '.join(type_aware(s) for s in still_used)} }} from '{module_specifier(file_name)}'")

    if added:
        entries = list(IMPORT_BLOCK_ENTRY.finditer(rewritten))
        position = entries[-1].end() if entries else 0
        rewritten = rewritten[:position] + '\n'.join(added) + '\n' + rewritten[position:]

    open(path, 'w').write(rewritten)
    for file_name, text in new_files.items():
        open(os.path.join(source_dir, file_name), 'w').write(text)
        print(f'{file_name}: {len(text.splitlines())} lines')
    print(f'{source_base}: {len(rewritten.splitlines())} lines')


if __name__ == '__main__':
    main()
