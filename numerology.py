# -*- coding: utf-8 -*-
# Shared numerology logic for Greek letters.

vowels = { 
    "Α": 1, "Ε": 5, "Η": 7, "Ι": 9, "Ο": 6, "Υ": 2, "Ω": 6 
}
consonants = {
    "Β": 2, "Γ": 3, "Δ": 4, "Ζ": 6, "Θ": 8, "Κ": 1, "Λ": 2, "Μ": 3, "Ν": 4,
    "Ξ": 5, "Π": 7, "Ρ": 8, "Σ": 9, "Τ": 1, "Φ": 3, "Χ": 4, "Ψ": 5
}

alphabet_dict = {**vowels, **consonants}

def reduce_number(n: int) -> int:
    """Reduce a number to a single digit by summing digits repeatedly."""
    n = int(n) if n is not None else 0
    while n >= 10:
        n = sum(int(digit) for digit in str(n))
    return n

def sum_values(word: str, table: dict) -> int:
    """Sum values of Greek letters based on a lookup table."""
    return sum(table.get(letter, 0) for letter in word)

def calculate(word: str):
    """Return n1..n6 for a word."""
    word = (word or "").strip().upper()
    vowel_sum = sum_values(word, vowels)
    consonant_sum = sum_values(word, consonants)
    full_sum = sum_values(word, alphabet_dict)
    return (
        vowel_sum, reduce_number(vowel_sum),
        consonant_sum, reduce_number(consonant_sum),
        full_sum, reduce_number(full_sum)
    )
