import { parseProcessRoles, processRolesLine, PROCESS_ROLES } from './process-role';

describe('PROCESS_ROLE', () => {
  it('unset, empty or all = every role', () => {
    for (const raw of [undefined, '', '  ', 'all', 'ALL']) {
      const p = parseProcessRoles(raw);
      expect([...p.roles].sort()).toEqual([...PROCESS_ROLES].sort());
      expect(p.unknown).toEqual([]);
    }
    expect(parseProcessRoles(undefined).raw).toBe('all');
  });

  it('a list selects roles; api is always implied because HTTP is always served', () => {
    expect([...parseProcessRoles('jobs').roles].sort()).toEqual(['api', 'jobs']);
    expect([...parseProcessRoles(' realtime , api ').roles].sort()).toEqual(['api', 'realtime']);
    expect([...parseProcessRoles('jobs,realtime').roles].sort()).toEqual(['api', 'jobs', 'realtime']);
  });

  it('unknown words are ignored and reported, never fatal', () => {
    const p = parseProcessRoles('jobs,worker,,Realtime');
    expect([...p.roles].sort()).toEqual(['api', 'jobs', 'realtime']);
    expect(p.unknown).toEqual(['worker']);
    expect(processRolesLine(p)).toBe('process roles: api, jobs, realtime (PROCESS_ROLE=jobs,worker,,Realtime); ignored: worker');
  });

  it('the boot line names the roles and the raw value', () => {
    expect(processRolesLine(parseProcessRoles('api'))).toBe('process roles: api (PROCESS_ROLE=api)');
  });
});
