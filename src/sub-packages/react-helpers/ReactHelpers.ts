import { ReactElement } from 'react/ts5.0';
import {render} from 'react-dom';
import { make } from '../dom-helpers';


export const makeReact = <ElementType extends HTMLElement>(nodeName: string, parent?: HTMLElement, className?: string, textContent?: string, style?: React.CSSProperties, child?: HTMLElement | ReactElement) => {
    const el = make(nodeName, parent, className, textContent, style);
    
    if (child) {
        if (isReactElement(child)) {
            render(child, el);
        } else {
            el.appendChild(child);
        }
    }

    return el as ElementType;
}

export function isReactElement(element: any): element is ReactElement {
    return typeof element.type === 'function';
}