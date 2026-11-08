import { listAvailableMenuItems } from '../../database/database.js'
import { TtlCache } from '../../shared/cache/ttlCache.js'
import { foodTerms } from '../../shared/foodDictionary.js'

const suggestionsCache = new TtlCache(30_000)

export const getMatchedItems = (request, response) => {
    const query = typeof request.query.q === 'string' ? request.query.q.trim().toLocaleLowerCase('en-US') : '';
    if (query.length < 2) {
      return response.status(400).json({ error: 'Enter at least two characters to find dishes.' });
    }

    const cachedItems = suggestionsCache.get(query)
    if (cachedItems) return response.json({ items: cachedItems, cached: true })

    const recognizedTerms = foodTerms(query)
    if (recognizedTerms.length === 0) return response.json({ items: [], cached: false })

    const terms = [...new Set([...query.split(/\s+/).filter((term) => term.length > 2), ...recognizedTerms])];
    const ranked = listAvailableMenuItems()
      .map((item) => {
        const searchable = `${item.name} ${item.description} ${item.restaurant} ${item.keywords.join(' ')}`.toLocaleLowerCase('en-US');
        const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
        return { item, score };
      })
      .sort((left, right) => right.score - left.score);

    const matching = ranked.filter(({ score }) => score > 0);
    const items = matching.slice(0, 4).map(({ item }) => ({
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