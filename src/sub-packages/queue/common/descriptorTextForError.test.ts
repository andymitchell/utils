import {it} from 'vitest';
import { descriptorTextForError } from './descriptorTextForError.ts';

it('names the job by its descriptor', () => {
    expect(descriptorTextForError('abc')).toBe(' [descriptor: abc]');
})

it('keeps an empty descriptor visible, as it was given', () => {
    expect(descriptorTextForError('')).toBe(' [descriptor: ]');
})

it('adds nothing when there is no descriptor', () => {
    expect(descriptorTextForError(undefined)).toBe('');
    expect(descriptorTextForError(null)).toBe('');
})
