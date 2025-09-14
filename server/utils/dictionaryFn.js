// server/utils/dictionaryFn.js

/**
 * Mock dictionary function
 * This function simulates a dictionary lookup.
 * In the future, you can replace this with an API call or local database.
 *
 * @param {string} word - The word to define.
 * @returns {Object} - An object with a mock meaning.
 */
function dictionaryFn(word) {
  if (!word || typeof word !== "string") {
    return { error: "Invalid word input" };
  }

  // Placeholder logic – can be replaced with real lookup later
  const cleaned = word.trim().toLowerCase();
  return {
    word: cleaned,
    meaning: `This is a placeholder meaning for the word "${cleaned}".`,
    source: "mock-dictionary",
  };
}

module.exports = dictionaryFn;
