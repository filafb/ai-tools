import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
function wikiRoot() {
    return process.env['WIKI_ROOT_OVERRIDE'] || join(homedir(), '.claude', 'wiki');
}
function resolveSafePath(relativePath) {
    const root = resolve(wikiRoot());
    const full = resolve(join(root, relativePath));
    if (!full.startsWith(root + '/') && full !== root)
        return null;
    return full;
}
export function handleWikiRead(path) {
    const fullPath = resolveSafePath(path);
    if (!fullPath)
        return { error: `Invalid path: ${path}` };
    if (!existsSync(fullPath))
        return { error: `Page not found: ${path}` };
    return { content: readFileSync(fullPath, 'utf8') };
}
