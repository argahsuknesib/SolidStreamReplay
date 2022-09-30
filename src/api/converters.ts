import { existsSync } from "fs"
// extracts the path from the raw string, along its type
// which is either a local path or a remote one
export function getRemotePath(source: string) : [string, "local" | "remote" | "invalid"] {
    const str = Buffer.from(source, "base64").toString().trim();
    try {
        // check if the decoded string properly represents a URL
        // if so, remote location is specified
        new URL(str);
        return [str, "remote"];
    } catch (err) {
        // file does not represent a valid URL, might be a local
        // filepath
        if (existsSync(str)) {
            return [str, "local"];
        }
    }
    // the decoded string is also returned, but its value might be
    // corrupt or weird
    return [str, "invalid"];
}
