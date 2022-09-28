export function getRemotePath(source: string) : string | null {
    const str = Buffer.from(source, "base64").toString().trim();
    return str;
    // when in remote mode, the code below is an extra check
    // check if the decoded string properly represents a URL
    // if so, this is the requested value, otherwise no valid
    // value can be decoded
    // try {
    //     new URL(str);
    //     return str;
    // } catch (err) {
    //     return null;
    // }
}
