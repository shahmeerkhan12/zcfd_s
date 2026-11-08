import { listAvailableMenuItems } from '../../database/database.js'
import { TtlCache } from '../../shared/cache/ttlCache.js'
<<<<<<< HEAD
=======
import { foodTerms } from '../../shared/foodDictionary.js'
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208

const suggestionsCache = new TtlCache(30_000)

export const getMatchedItems = (request, response) => {
    const query = typeof request.query.q === 'string' ? request.query.q.trim().toLocaleLowerCase('en-US') : '';
    if (query.length < 2) {
      return response.status(400).json({ error: 'Enter at least two characters to find dishes.' });
    }

<<<<<<< HEAD
    const cachedItems = suggestionsCache.get(query)
    if (cachedItems) return response.json({ items: cachedItems, cached: true })

    const terms = query.split(/\s+/).filter((term) => term.length > 2);
=======
    const recognizedTerms = foodTerms(query)
    if (recognizedTerms.length === 0) return response.json({ items: [], cached: false })

    const cachedItems = suggestionsCache.get(query)
    if (cachedItems) return response.json({ items: cachedItems, cached: true })

    const terms = [...new Set([...query.split(/\s+/).filter((term) => term.length > 2), ...recognizedTerms])];
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
    const ranked = listAvailableMenuItems()
      .map((item) => {
        const searchable = `${item.name} ${item.description} ${item.restaurant} ${item.keywords.join(' ')}`.toLocaleLowerCase('en-US');
        const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
        return { item, score };
      })
      .sort((left, right) => right.score - left.score);

    const matching = ranked.filter(({ score }) => score > 0);
<<<<<<< HEAD
    const items = (matching.length ? matching : ranked).slice(0, 4).map(({ item }) => ({
=======
    const items = matching.slice(0, 4).map(({ item }) => ({
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
      id: item.id,
      name: item.name,
      restaurant: item.restaurant,
      description: item.description,
      price: item.price,
      rating: item.rating,
      time: item.time,
      image: item.image,
      tag: item.tag,
    }));

    suggestionsCache.set(query, items)
    return response.json({ items, cached: false });
  };