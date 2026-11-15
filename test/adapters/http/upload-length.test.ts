import { expect, it } from 'vitest'
import { reviewUploadLength, utf8Length } from '../../../src/domain/text/utf8'

it.each(['ASCII', 'ü', '😀', '\ud800', '\udc00', '!*~\'()_- .', '漢字\n\t', 'a+b&c=3%'])('M-d measures the same UTF-8 and form bytes as browser encoding for %j', body => {
  expect(utf8Length(body)).toBe(new TextEncoder().encode(body).length)
  expect(reviewUploadLength('key+', body, 17)).toBe(new TextEncoder().encode(new URLSearchParams({ key: 'key+', review: body, baseRevision: '17' }).toString()).length)
})
