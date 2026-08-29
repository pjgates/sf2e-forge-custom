export function isActiveCharacterPath(path: string): boolean {
    return !path.split("/").includes("archive");
}
