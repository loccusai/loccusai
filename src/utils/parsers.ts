/**
 * A simple parser for markdown tables.
 */
export function parseMarkdownTable<T extends Record<string, string>>(markdown: string): T[] {
    const lines = markdown.trim().split('\n').filter(line => line.includes('|'));
    if (lines.length < 2) return [];

    const headers = lines[0].split('|').map(h => h.trim()).filter(h => h);
    const dataLines = lines.slice(1).filter(line => !line.match(/^[-|:\s]+$/));

    return dataLines.map(line => {
        const values = line.split('|').map(v => v.trim());
        if (values[0] === '') values.shift();
        if (values[values.length - 1] === '') values.pop();
        const entry: Record<string, string> = {};
        headers.forEach((header, index) => {
            entry[header] = values[index] || '';
        });
        return entry as T;
    });
}