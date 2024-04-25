

export function emptyEl(el: HTMLElement, replacementText?: string): HTMLElement {
    while (el.hasChildNodes() && el.lastChild) {
        el.removeChild(el.lastChild);
    }
    el.textContent = typeof replacementText === "string" ? replacementText : "";
    return el;
}



export function convertNodeToElement(node: Node, ifNotElementGoToParent?: boolean): Element | undefined {
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

export function createIconElement(materialName: string, classNames?: Array<string>) {
    // @ts-ignore - document seems to have been overtaken by React
    const iconElement = document.createElement('span');
    iconElement.classList.add('material-icons');
    if (Array.isArray(classNames)) iconElement.classList.add(...classNames);
    iconElement.textContent = materialName;
    return iconElement;
    
}


export const make = <ElementType extends HTMLElement>(nodeName: string, parent?: HTMLElement, className?: string, textContent?: string, style?: React.CSSProperties, child?: HTMLElement) => {
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
        el.appendChild(child);
    }

    return el as ElementType;
}


