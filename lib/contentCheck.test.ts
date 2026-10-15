import { describe, it, expect } from 'vitest'
import { checkContent } from './contentCheck'

describe('checkContent', () => {
  it('passes clean civic report text', () => {
    const result = checkContent({
      description: 'Leaning pole near intersection of Main St and Elm Ave. Looks like it could fall.',
      address: '145 Greenwich Ave',
    })
    expect(result.flagged).toBe(false)
    expect(result.flaggedFields).toEqual([])
  })

  it('passes realistic report language without false positives', () => {
    const descriptions = [
      'Pole is damaged and leaning about 15 degrees toward the road.',
      'Low-hanging wires near the school. Kids walk under them every day.',
      'Double pole has been here for more than a year. The old one is cracked.',
      'Damaged equipment on the pole, sparking when it rains.',
      'This pole is in the middle of the sidewalk blocking wheelchair access.',
    ]
    for (const desc of descriptions) {
      const result = checkContent({ description: desc })
      expect(result.flagged, `False positive on: "${desc}"`).toBe(false)
    }
  })

  it('flags profanity in description', () => {
    const result = checkContent({
      description: 'This fucking pole has been here for years',
      address: '100 Main St',
    })
    expect(result.flagged).toBe(true)
    expect(result.flaggedFields).toContain('description')
    expect(result.flaggedFields).not.toContain('address')
  })

  it('flags profanity in address', () => {
    const result = checkContent({
      description: 'Leaning pole near intersection',
      address: 'Fuck Street',
    })
    expect(result.flagged).toBe(true)
    expect(result.flaggedFields).toContain('address')
    expect(result.flaggedFields).not.toContain('description')
  })

  it('flags both fields when both contain profanity', () => {
    const result = checkContent({
      description: 'This damn shit is broken',
      address: 'Ass Boulevard',
    })
    expect(result.flagged).toBe(true)
    expect(result.flaggedFields).toContain('description')
    expect(result.flaggedFields).toContain('address')
  })

  it('handles null address gracefully', () => {
    const result = checkContent({
      description: 'Clean report about a leaning pole',
      address: null,
    })
    expect(result.flagged).toBe(false)
    expect(result.flaggedFields).toEqual([])
  })

  it('handles undefined address gracefully', () => {
    const result = checkContent({
      description: 'Clean report about a leaning pole',
    })
    expect(result.flagged).toBe(false)
    expect(result.flaggedFields).toEqual([])
  })

  it('catches leet-speak obfuscation', () => {
    const result = checkContent({
      description: 'This pole is f4ck1ng terrible',
    })
    // obscenity's transformer pipeline handles common leet-speak
    expect(result.flagged).toBe(true)
  })

  it('catches repeated character obfuscation', () => {
    const result = checkContent({
      description: 'What the fuuuuuck is this pole doing here',
    })
    expect(result.flagged).toBe(true)
  })
})
