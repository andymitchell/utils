import {it} from 'vitest';
import { descriptorTextForError } from './descriptorTextForError.ts';

it('handles string ', () => {
    expect(descriptorTextForError('abc')).toBe(' [descriptor: abc]');
})

it('handles null as undefined', () => {
    expect(descriptorTextForError(null)).toBe(' [descriptor: undefined]');
})