# Implementation Plan: Implement number key selection for question answers

**Task ID:** 5c978d79-58aa-4555-b5ed-e9632edd7427  
**Generated:** 2025-11-18

## Summary

Replace the existing alphabetic key (a, b, c, d) answer selection with numeric key (1, 2, 3, 4) selection in the InteractiveQuestion component. This involves modifying the keyboard event handler to respond to number keys instead of letter keys, and updating the UI display to show numeric labels (1), 2), 3), 4)) instead of alphabetic labels (a), b), c), d)).

## Implementation Steps

### 1. Analysis
- [x] Identify relevant files: `src/renderer/features/terminal/components/InteractiveQuestion.tsx`
- [x] Understand existing keyboard event handler pattern
- [x] Confirm UI rendering approach for answer labels

### 2. Changes Required
- [ ] Modify keyboard event listener in `InteractiveQuestion.tsx` to capture numeric keys ('1', '2', '3', '4') instead of alphabetic keys ('a', 'b', 'c', 'd')
- [ ] Update answer index mapping logic (numeric keys '1'-'4' map to indices 0-3)
- [ ] Replace alphabetic label generation with numeric labels in UI rendering
- [ ] Update any UI hints or help text that reference alphabetic keys

### 3. Implementation
- [ ] Update keyboard event handler to detect keys '1', '2', '3', '4' (or numeric codes)
- [ ] Modify the key-to-index conversion logic from `key.charCodeAt(0) - 'a'.charCodeAt(0)` to `parseInt(key) - 1`
- [ ] Change answer label display from letters (a, b, c, d) to numbers (1, 2, 3, 4)
- [ ] Test with various numbers of answer options (2-4+ answers)
- [ ] Verify no regression in keyboard navigation or answer submission

## File Changes

### Modified Files

```
src/renderer/features/terminal/components/InteractiveQuestion.tsx
  - Keyboard event handler: Change key detection from 'a'-'d' to '1'-'4'
  - Key-to-index mapping: Replace alphabetic calculation with numeric parsing
  - Answer label rendering: Update from alphabetic (a, b, c, d) to numeric (1, 2, 3, 4)
  - UI hints/instructions: Update any text mentioning "press a/b/c/d" to "press 1/2/3/4"
```

## Considerations

### Key Changes
- **Keyboard event handler**: Replace condition checking for keys 'a' through 'd' with checks for '1' through '4'
- **Index calculation**: Change from `key.charCodeAt(0) - 'a'.charCodeAt(0)` to `parseInt(key) - 1` or similar numeric conversion
- **Label generation**: Update answer prefix from alphabetic sequence (String.fromCharCode(97 + index)) to numeric (index + 1)

### Potential Risks
- **Breaking change**: Users accustomed to alphabetic keys will need to adapt to numeric keys
- **Bounds checking**: Ensure numeric keys outside valid range (e.g., pressing '5' when only 4 answers exist) are properly ignored
- **Key event compatibility**: Verify numeric key detection works across different keyboard layouts and event types

### Testing Approach
- Test with 2, 3, 4, and more answer options to ensure correct mapping
- Verify that only valid numeric keys (within answer count) trigger selection
- Test that invalid keys (letters, special characters, out-of-range numbers) are ignored
- Confirm visual display shows correct numeric labels (1), 2), 3), 4))
- Validate answer submission works correctly with numeric selection
- Check for any TypeScript compilation errors

### Edge Cases
- Questions with more than 9 answers (if supported) - may need two-digit handling
- Questions with fewer than 4 answers - ensure higher numbers (3, 4) are ignored appropriately
- Rapid key presses or key holds - ensure debouncing/proper event handling