// Container is expected to be a contenteditable div, but it can be anything (including a node in it)

export function getCursorPosition(container: HTMLElement): { start: number; end?: number } {
    if (container instanceof HTMLTextAreaElement || container instanceof HTMLInputElement) {
        return container.selectionDirection === "backward" ? 
            {start: container.selectionEnd ?? 0, end: container.selectionStart ?? undefined} : 
            {start: container.selectionStart ?? 0, end: container.selectionEnd ?? undefined} 
    } else {
        let start = 0, end = 0;
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(container);
            preCaretRange.setEnd(range.startContainer, range.startOffset);
            start = preCaretRange.toString().length;
            end = start + range.toString().length;
        }
        return { start, end };
    }
}

export function setCursorPosition(container: Node, position: { start: number, end?: number }) {
    if (container instanceof HTMLTextAreaElement || container instanceof HTMLInputElement) {
        container.selectionStart = position.start;
        container.selectionEnd = position.end ?? position.start;
    } else {
        if (!window.getSelection) return;
        const selection = window.getSelection();
        const range = document.createRange();

        if( selection ) {

            if (container.nodeType === Node.TEXT_NODE) {
                // Handle text node
                range.setStart(container, position.start);
                range.setEnd(container, position.end ?? position.start);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {

                range.setStart(container, 0);
                range.collapse(true);

                let charCount = 0, node;

                const setRange = (node: Node, pos: { start: number, end?: number }, range: Range) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const nextCharCount = charCount + node.textContent!.length;
                        if (!pos.end) pos.end = pos.start;
                        if (charCount <= pos.start && nextCharCount >= pos.start) {
                            range.setStart(node, pos.start - charCount);
                        }
                        if (charCount < pos.end && nextCharCount >= pos.end) {
                            range.setEnd(node, pos.end - charCount);
                            return true; // End node found
                        }
                        charCount = nextCharCount;
                    } else {
                        for (let i = 0; i < node.childNodes.length; i++) {
                            const childNode = node.childNodes[i];
                            if (childNode && setRange(childNode, pos, range)) {
                                return true; // End node found
                            }
                        }
                    }
                    return false; // End node not found
                };

                if (setRange(container, position, range)) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        }
    }
}
