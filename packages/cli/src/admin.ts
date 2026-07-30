import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createInvite, createUser, findUserByHandle, listInvites, listUsers, mintToken,
} from '@makerlord/auth';

/**
 * `maker invite | users | token` — the HUMAN half of admission (D52,
 * the D51 pattern): these exist only in the maintainer CLI. No web
 * surface, no agent surface can mint an invite or a token for someone
 * else. Run on the server checkout, where MAKERLORD_USERS_PATH lives.
 */

export function adminMain(argv: string[]): number {
  const [group, cmd, ...rest] = argv;
  try {
    if (group === 'invite' && (cmd === 'new' || cmd === undefined)) {
      const noteIdx = rest.indexOf('--note');
      const code = createInvite(noteIdx >= 0 ? rest[noteIdx + 1] : undefined);
      process.stdout.write(
        `invite code: ${code}\n` +
        `  single-use, expires in 7 days\n` +
        `  join link: https://makerlord.dev/join?code=${code}\n`,
      );
      return 0;
    }
    if (group === 'invite' && cmd === 'list') {
      for (const i of listInvites()) {
        const state = i.usedBy ? `used by ${i.usedBy}`
          : i.expiresAt < Date.now() ? 'expired' : 'open';
        process.stdout.write(`  ${i.code}  ${state}${i.note ? `  (${i.note})` : ''}\n`);
      }
      return 0;
    }
    if (group === 'users' && cmd === 'list') {
      for (const u of listUsers()) {
        process.stdout.write(`  ${u.handle}  ${u.id}  since ${u.createdAt.slice(0, 10)}\n`);
      }
      return 0;
    }
    if (group === 'users' && cmd === 'adopt' && rest[0]) {
      return adopt(rest[0]);
    }
    if (group === 'token' && cmd === 'new') {
      const userIdx = rest.indexOf('--user');
      const handle = userIdx >= 0 ? rest[userIdx + 1] : undefined;
      if (!handle) throw new Error('token new needs --user <handle>');
      const user = findUserByHandle(handle);
      if (!user) throw new Error(`no user "${handle}"`);
      const clear = mintToken(user.id, rest.includes('--label')
        ? rest[rest.indexOf('--label') + 1] ?? 'cli' : 'cli');
      process.stdout.write(
        `${clear}\n  shown ONCE — put it in ~/.makerlord/bridge.json (install.sh --token)\n`,
      );
      return 0;
    }
    process.stdout.write(
      'usage: maker invite [new [--note x] | list]\n' +
      '       maker users [list | adopt <handle>]\n' +
      '       maker token new --user <handle> [--label x]\n',
    );
    return 1;
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}

/** One-time migration (auth spec §6): pre-auth projects at the root of
 *  projectsRoot move into the named user's directory. */
function adopt(handle: string): number {
  const user = findUserByHandle(handle);
  if (!user) throw new Error(`no user "${handle}" — they must join first`);
  const root = resolve(process.env.MAKERLORD_PROJECTS_ROOT ?? './projects');
  const target = join(root, user.id);
  mkdirSync(target, { recursive: true });
  let moved = 0;
  for (const entry of readdirSync(root)) {
    if (entry.startsWith('u_')) continue;               // already scoped
    if (!existsSync(join(root, entry, 'project.json'))) continue;
    renameSync(join(root, entry), join(target, entry));
    moved += 1;
  }
  process.stdout.write(`adopted ${moved} project(s) into ${user.handle} (${user.id})\n`);
  return 0;
}

export { createUser };   // used by join flow tests
