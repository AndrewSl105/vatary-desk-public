const OPEN = '<user_submitted_content>';
const CLOSE = '</user_submitted_content>';

/**
 * Marks text as data from a user. Any form of the tag inside the text is
 * defused first: a ticket containing the closing tag must not be able to end
 * the block and carry on as if it were the tool's own output.
 */
export function wrapUserContent(text: string): string {
  const safe = text.replace(/<\s*(\/?)\s*user_submitted_content/gi, '&lt;$1user_submitted_content');
  return `${OPEN}${safe}${CLOSE}`;
}
