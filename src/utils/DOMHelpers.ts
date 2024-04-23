import { ReactElement } from 'react';
import {render} from 'react-dom';

function emptyEl(el: HTMLElement, replacementText?: string): HTMLElement {
    while (el.hasChildNodes() && el.lastChild) {
        el.removeChild(el.lastChild);
    }
    el.textContent = typeof replacementText === "string" ? replacementText : "";
    return el;
}

const make = <ElementType extends HTMLElement>(nodeName: string, parent?: HTMLElement, className?: string, textContent?: string, style?: React.CSSProperties, child?: HTMLElement | ReactElement) => {
    const el = document.createElement(nodeName);
    if (style) {
        for (const key in style) {
            const styleKey = key as keyof React.CSSProperties;
            const styleValue = style[styleKey];
            if (styleValue !== undefined) {
                (el.style as any)[styleKey] = styleValue;
            }
        }
    }
    if (className) el.className = className;
    if (parent) parent.appendChild(el);
    if (textContent) el.textContent = textContent;

    if (child) {
        if (isReactElement(child)) {
            render(child, el);
        } else {
            el.appendChild(child);
        }
    }

    return el as ElementType;
}

function isReactElement(element: any): element is ReactElement {
    return typeof element.type === 'function';
}

function convertNodeToElement(node: Node, ifNotElementGoToParent?: boolean): Element | undefined {
    if (node.nodeType === 1) {
        return node as Element;
    }
    let nodeFinder: Node | undefined = node;
    if (ifNotElementGoToParent) {
        while (nodeFinder && nodeFinder.nodeType !== 1) nodeFinder = nodeFinder.parentNode as Node;
        if (nodeFinder) return nodeFinder as Element;
    }
    return undefined;
}

function createIconElement(materialName: string, classNames?: Array<string>) {
    // @ts-ignore - document seems to have been overtaken by React
    const iconElement = document.createElement('span');
    iconElement.classList.add('material-icons');
    if (Array.isArray(classNames)) iconElement.classList.add(...classNames);
    iconElement.textContent = materialName;
    return iconElement;
}


export const DOMHelpers = {
    emptyEl,
    make,
    isReactElement,
    convertNodeToElement,
    createIconElement
}

