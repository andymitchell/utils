// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import insertHTMLatCursor, { _insertHTMLatCursor } from './insertHTMLatCursor.ts';

// Mock the console.log to keep test output clean
vi.spyOn(console, 'log').mockImplementation(() => { });

beforeEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
});

/**
 * Creates a content-editable DIV element for testing.
 * @param attach - Whether to append the element to the document body.
 * @param innerHTML - The initial HTML content of the element.
 * @returns The created HTMLDivElement.
 */
function createContentEditableDiv(attach = true, innerHTML = ''): HTMLDivElement {
    const editableDiv = document.createElement('div');
    editableDiv.contentEditable = 'true';
    editableDiv.innerHTML = innerHTML;

    if (attach) {
        document.body.appendChild(editableDiv);
    }

    return editableDiv;
}

/**
 * Creates a textarea element for testing.
 * @param attach - Whether to append the element to the document body.
 * @param value - The initial value of the textarea.
 * @returns The created HTMLTextAreaElement.
 */
function createTextarea(attach = true, value = ''): HTMLTextAreaElement {
    const textarea = document.createElement('textarea');
    textarea.value = value;

    if (attach) {
        document.body.appendChild(textarea);
    }

    return textarea;
}

/**
 * Sets the cursor position or selection within a content-editable element.
 * @param element - The element to set the selection in.
 * @param startNode - The node to start the selection in.
 * @param startOffset - The offset within the start node.
 * @param endNode - Optional. The node to end the selection in.
 * @param endOffset - Optional. The offset within the end node.
 */
function setSelection(element: HTMLElement, startNode: Node, startOffset: number, endNode?: Node, endOffset?: number) {
    element.focus();
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    if (endNode && typeof endOffset !== 'undefined') {
        range.setEnd(endNode, endOffset);
    } else {
        range.collapse(true);
    }

    selection.removeAllRanges();
    selection.addRange(range);
}


describe('insertHTMLatCursor', () => {

    describe('ContentEditable Element', () => {

        it('should insert an HTML string into an empty content-editable div', () => {
            const editableDiv = createContentEditableDiv(true, '<br>');
            insertHTMLatCursor(editableDiv, '<span>hello world</span>');
            expect(editableDiv.innerHTML).toBe('<span>hello world</span><br>');
        });

        it('should insert an HTML string into a nested content-editable div', () => {
            const container = document.createElement('div');
            const editableDiv = createContentEditableDiv(false, '<br>');
            container.appendChild(editableDiv);
            document.body.appendChild(container);

            insertHTMLatCursor(editableDiv, '<span>hello world</span>');
            expect(editableDiv.innerHTML).toBe('<span>hello world</span><br>');
        });

        it('should insert an HTML string at the beginning of existing content', () => {
            const editableDiv = createContentEditableDiv(true, 'world');
            setSelection(editableDiv, editableDiv.firstChild!, 0);

            insertHTMLatCursor(editableDiv, '<span>hello</span> ');
            expect(editableDiv.innerHTML).toBe('<span>hello</span> world');
        });

        it('should insert an HTML string in the middle of existing content', () => {
            const editableDiv = createContentEditableDiv(true, 'hello world');
            setSelection(editableDiv, editableDiv.firstChild!, 6); // After "hello "

            insertHTMLatCursor(editableDiv, '<b>beautiful</b> ');
            expect(editableDiv.innerHTML).toBe('hello <b>beautiful</b> world');
        });

        it('should insert an HTML string at the end of existing content', () => {
            const editableDiv = createContentEditableDiv(true, 'hello');
            setSelection(editableDiv, editableDiv.firstChild!, 5);

            insertHTMLatCursor(editableDiv, ' <span>world</span>');
            expect(editableDiv.innerHTML).toBe('hello <span>world</span>');
        });

        it('should replace selected content with the new HTML', () => {
            const editableDiv = createContentEditableDiv(true, 'hello beautiful world');
            const textNode = editableDiv.firstChild!;
            setSelection(editableDiv, textNode, 6, textNode, 15); // Select "beautiful"

            insertHTMLatCursor(editableDiv, '<span>gorgeous</span>');
            expect(editableDiv.innerHTML).toBe('hello <span>gorgeous</span> world');
        });

        it('should insert an HTMLElement node correctly', () => {
            const editableDiv = createContentEditableDiv(true, 'Some text');
            setSelection(editableDiv, editableDiv.firstChild!, 5); // After "Some "

            const newNode = document.createElement('i');
            newNode.textContent = 'amazing';

            insertHTMLatCursor(editableDiv, newNode);
            expect(editableDiv.innerHTML).toBe('Some <i>amazing</i>text');
        });

        it('should insert a DocumentFragment correctly', () => {
            const editableDiv = createContentEditableDiv(true, 'A B');
            setSelection(editableDiv, editableDiv.firstChild!, 2);

            const fragment = document.createDocumentFragment();
            const strong = document.createElement('strong');
            strong.textContent = 'bold';
            const em = document.createElement('em');
            em.textContent = ' italic';
            fragment.appendChild(strong);
            fragment.appendChild(em);

            // @ts-expect-error
            insertHTMLatCursor(editableDiv, fragment);
            expect(editableDiv.innerHTML).toBe('A <strong>bold</strong><em> italic</em>B');
        });

        it('should throw an error if the selection is outside the target element', () => {
            const editableDiv = createContentEditableDiv();
            const otherElement = document.createElement('div');
            document.body.appendChild(otherElement);
            otherElement.textContent = 'some other text';

            setSelection(otherElement, otherElement.firstChild!, 0);

            expect(() => _insertHTMLatCursor(editableDiv, '<span>test</span>', false))
                .toThrow("Selection/cursor is not inside the given element");
        });

        it('should return the first inserted element when inserting HTML', () => {
            const editableDiv = createContentEditableDiv();
            const result = insertHTMLatCursor(editableDiv, '<strong>Hello</strong><em>World</em>');

            expect(result).toBeInstanceOf(HTMLElement);
            expect(result?.tagName).toBe('STRONG');
            expect(result?.textContent).toBe('Hello');
        });

        it('should return the inserted node when inserting an HTMLElement', () => {
            const editableDiv = createContentEditableDiv();
            const em = document.createElement('em');
            em.textContent = 'World';

            const result = insertHTMLatCursor(editableDiv, em);
            expect(result).toBe(em);
        });

        it('should return null if an empty string is inserted', () => {
            const editableDiv = createContentEditableDiv();
            const result = insertHTMLatCursor(editableDiv, '');
            expect(result).toBeNull();
        });
    });

    describe('HTMLTextAreaElement', () => {

        it('should insert text into an empty textarea', () => {
            const textarea = createTextarea();
            insertHTMLatCursor(textarea, 'hello world');
            expect(textarea.value).toBe('hello world');
            expect(textarea.selectionStart).toBe(11);
            expect(textarea.selectionEnd).toBe(11);
        });

        it('should insert text at the beginning of a textarea', () => {
            const textarea = createTextarea(true, 'world');
            textarea.selectionStart = textarea.selectionEnd = 0;

            insertHTMLatCursor(textarea, 'hello ');
            expect(textarea.value).toBe('hello world');
            expect(textarea.selectionStart).toBe(6);
            expect(textarea.selectionEnd).toBe(6);
        });

        it('should insert text in the middle of a textarea', () => {
            const textarea = createTextarea(true, 'hello world');
            textarea.selectionStart = textarea.selectionEnd = 6; // After "hello "

            insertHTMLatCursor(textarea, 'brave new ');
            expect(textarea.value).toBe('hello brave new world');
            expect(textarea.selectionStart).toBe(16);
            expect(textarea.selectionEnd).toBe(16);
        });

        it('should insert text at the end of a textarea', () => {
            const textarea = createTextarea(true, 'hello');
            textarea.selectionStart = textarea.selectionEnd = 5;

            insertHTMLatCursor(textarea, ' world');
            expect(textarea.value).toBe('hello world');
            expect(textarea.selectionStart).toBe(11);
            expect(textarea.selectionEnd).toBe(11);
        });

        it('should replace the selected text in a textarea', () => {
            const textarea = createTextarea(true, 'hello old world');
            textarea.selectionStart = 6;
            textarea.selectionEnd = 9; // Select "old"

            insertHTMLatCursor(textarea, 'new');
            expect(textarea.value).toBe('hello new world');
            expect(textarea.selectionStart).toBe(9);
            expect(textarea.selectionEnd).toBe(9);
        });

        it('should throw an error when trying to insert an HTMLElement into a textarea', () => {
            const textarea = createTextarea();
            const element = document.createElement('div');

            expect(() => insertHTMLatCursor(textarea, element)).toThrow("html must be string");
        });

        it('should correctly handle special characters and newlines', () => {
            const textarea = createTextarea(true, 'line 1\nline 3');
            textarea.selectionStart = textarea.selectionEnd = 7; // After "line 1\n"

            const textToInsert = 'line 2\n';
            insertHTMLatCursor(textarea, textToInsert);

            expect(textarea.value).toBe('line 1\nline 2\nline 3');
            expect(textarea.selectionStart).toBe(7 + textToInsert.length);
            expect(textarea.selectionEnd).toBe(7 + textToInsert.length);
        });

        it('should return undefined when used with a textarea', () => {
            const textarea = createTextarea();
            const result = insertHTMLatCursor(textarea, 'some text');
            expect(result).toBeUndefined();
        });
    });

    // **NEW**: Tests for invalid element types
    describe('Invalid Element Types', () => {

        const errorMessage = "Target element must be a HTMLTextAreaElement or have the contentEditable property set to true.";

        it('should throw an error for a standard div', () => {
            const div = document.createElement('div');
            document.body.appendChild(div);
            expect(() => insertHTMLatCursor(div, 'test')).toThrow(errorMessage);
        });

        it('should throw an error for a span', () => {
            const span = document.createElement('span');
            document.body.appendChild(span);
            expect(() => insertHTMLatCursor(span, 'test')).toThrow(errorMessage);
        });

        it('should throw an error for an image element', () => {
            const img = document.createElement('img');
            document.body.appendChild(img);
            expect(() => insertHTMLatCursor(img, 'test')).toThrow(errorMessage);
        });

        it('should throw an error for an input element of type text', () => {
            const input = document.createElement('input');
            input.type = 'text';
            document.body.appendChild(input);
            // This is invalid because the function is not designed to handle inputs,
            // even though they have a cursor.
            expect(() => insertHTMLatCursor(input, 'test')).toThrow(errorMessage);
        });

        it('should throw an error for a button element', () => {
            const button = document.createElement('button');
            document.body.appendChild(button);
            expect(() => insertHTMLatCursor(button, 'test')).toThrow(errorMessage);
        });
    });
});