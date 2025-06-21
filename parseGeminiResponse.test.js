global.chrome = {
  runtime: { onMessage: { addListener: jest.fn() }, onInstalled: { addListener: jest.fn() } },
  storage: { sync: { get: jest.fn() }, local: { get: jest.fn(), set: jest.fn() } }
};
const { parseGeminiResponse } = require('./background.js');

describe('parseGeminiResponse', () => {
  test('parses JSON wrapped in fences', () => {
    const apiResponse = {
      candidates: [{
        content: {
          parts: [{ text: '```json\n{"hello":"world"}\n```' }]
        }
      }]
    };

    expect(parseGeminiResponse(apiResponse)).toEqual({ hello: 'world' });
  });

  test('throws an error for invalid JSON', () => {
    const apiResponse = {
      candidates: [{
        content: {
          parts: [{ text: '```json\n{invalid}\n```' }]
        }
      }]
    };

    expect(() => parseGeminiResponse(apiResponse)).toThrow('The API returned an invalid or unexpected format.');
  });
});
