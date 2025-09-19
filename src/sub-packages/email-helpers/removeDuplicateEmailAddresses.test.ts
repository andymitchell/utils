import { describe, it, expect } from 'vitest';
import { removeDuplicateEmailAddresses } from './removeDuplicateEmailAddresses.ts';

// Mock data setup
const contacts = [
    { name: 'Peter Jones', emailAddress: 'peter.jones@gmail.com' }, // Irreducible: peterjones@gmail.com
    { name: 'Jane Smith', emailAddress: 'jane.smith@yahoo.com' },
    { name: 'Peter Jones Alias', emailAddress: 'peterjones+work@gmail.com' }, // Duplicate of Peter Jones
    { name: 'John Doe', emailAddress: 'john.doe@outlook.com' },
    { name: 'Jane Smith Duplicate', emailAddress: 'jane.smith@yahoo.com' }, // Duplicate of Jane Smith
    { name: 'No Email Contact', emailAddress: undefined }, // Should be filtered out
    { name: 'Empty Email Contact', emailAddress: '' }, // Should be filtered out
    { name: 'Malformed Email', emailAddress: 'not-an-email' }, // Should be filtered out
];

describe('removeDuplicateEmailAddresses', () => {

    it('should return an empty array if the input is null or undefined', () => {
        // @ts-ignore
        expect(removeDuplicateEmailAddresses(null)).toEqual([]);
        // @ts-ignore
        expect(removeDuplicateEmailAddresses(undefined)).toEqual([]);
    });

    it('should return an empty array for an empty list of contacts', () => {
        expect(removeDuplicateEmailAddresses([])).toEqual([]);
    });

    it('should remove contacts with duplicate email addresses', () => {
        const result = removeDuplicateEmailAddresses(contacts);
        // There are 2 duplicates in the original list (peterjones+work and the second jane.smith)
        // and 3 invalid contacts, so 8 - 2 - 3 = 3
        expect(result.length).toBe(3);
    });

    it('should correctly identify duplicates using Gmail normalization rules', () => {
        const result = removeDuplicateEmailAddresses(contacts);
        const peterEmails = result.filter(c => c.irreducibleEmailAddress === 'peterjones@gmail.com');
        expect(peterEmails.length).toBe(1);
        // Ensure it kept the first one it saw
        expect(peterEmails[0]?.name).toBe('Peter Jones');
    });

    it('should add the irreducibleEmailAddress property to each contact', () => {
        const result = removeDuplicateEmailAddresses(contacts);

        expect(result[0]).toHaveProperty('irreducibleEmailAddress', 'peterjones@gmail.com');
        expect(result[1]).toHaveProperty('irreducibleEmailAddress', 'jane.smith@yahoo.com');
        expect(result[2]).toHaveProperty('irreducibleEmailAddress', 'john.doe@outlook.com');
    });

    it('should filter out contacts with undefined, null, or empty email addresses', () => {
        const result = removeDuplicateEmailAddresses(contacts);
        const invalidContact = result.find(c => c.name === 'No Email Contact' || c.name === 'Empty Email Contact');
        expect(invalidContact).toBeUndefined();
    });

    it('should handle a list with no duplicates', () => {
        const noDuplicates = [
            { name: 'First', emailAddress: 'first@test.com' },
            { name: 'Second', emailAddress: 'second@test.com' },
        ];
        const result = removeDuplicateEmailAddresses(noDuplicates);
        expect(result.length).toBe(2);
        expect(result[0]?.name).toBe('First');
        expect(result[1]?.name).toBe('Second');
    });

    it('should use a custom pluckEmailAddress function to extract emails', () => {
        const customContacts = [
            { name: 'Contact A', details: { email: 'user.a@gmail.com' } },
            { name: 'Contact B', details: { email: 'user.b@yahoo.com' } },
            { name: 'Contact A Duplicate', details: { email: 'usera+test@gmail.com' } }
        ];

        const pluck = (contact: typeof customContacts[0]) => contact.details.email;
        const result = removeDuplicateEmailAddresses(customContacts, pluck);

        expect(result.length).toBe(2);
        expect(result[0]?.name).toBe('Contact A');
        expect(result[0]?.irreducibleEmailAddress).toBe('usera@gmail.com');
        expect(result[1]?.name).toBe('Contact B');
        expect(result[1]?.irreducibleEmailAddress).toBe('user.b@yahoo.com');
    });


    describe('when compareOnIrreducible is false', () => {
        const contactsForIrreducibleTest = [
            { id: 1, emailAddress: 'test.user@gmail.com' }, // irreducible: testuser@gmail.com
            { id: 2, emailAddress: 'testuser+alias@gmail.com' }, // irreducible: testuser@gmail.com
            { id: 3, emailAddress: 'jane.doe@yahoo.com' },
            { id: 4, emailAddress: 'jane.doe@yahoo.com' }, // exact duplicate
        ];

        it('should NOT remove emails that are only duplicates in their irreducible form', () => {
            const pluck = (c: { id: number, emailAddress: string }) => c.emailAddress;
            const result = removeDuplicateEmailAddresses(contactsForIrreducibleTest, pluck, false);

            // It should remove the exact duplicate (id: 4) but keep the two Gmail variants (id: 1 and 2)
            expect(result.length).toBe(3);

            // Verify that the two different Gmail addresses are still present
            const contact1 = result.find(c => c.id === 1);
            const contact2 = result.find(c => c.id === 2);
            expect(contact1).toBeDefined();
            expect(contact2).toBeDefined();
        });

        it('should still add the correct irreducibleEmailAddress property to each object', () => {
            const pluck = (c: { id: number, emailAddress: string }) => c.emailAddress;
            const result = removeDuplicateEmailAddresses(contactsForIrreducibleTest, pluck, false);

            const contact1 = result.find(c => c.id === 1);
            const contact2 = result.find(c => c.id === 2);
            const contact3 = result.find(c => c.id === 3);

            // Check that the irreducible form is still correctly calculated and added for all contacts
            expect(contact1?.irreducibleEmailAddress).toBe('testuser@gmail.com');
            expect(contact2?.irreducibleEmailAddress).toBe('testuser@gmail.com');
            expect(contact3?.irreducibleEmailAddress).toBe('jane.doe@yahoo.com');
        });

        it('should still remove exact string duplicates', () => {
            const pluck = (c: { id: number, emailAddress: string }) => c.emailAddress;
            const result = removeDuplicateEmailAddresses(contactsForIrreducibleTest, pluck, false);

            // The two 'jane.doe@yahoo.com' contacts should be deduped to one.
            const janeDoes = result.filter(c => c.emailAddress === 'jane.doe@yahoo.com');
            expect(janeDoes.length).toBe(1);

            // Verify it kept the first one it saw
            expect(janeDoes[0]?.id).toBe(3);
        });
    });


});