// Explicit terms avoid treating arbitrary words that contain food names as food.
const aliases = {
  burger: ['burger', 'burgers', 'бургер', 'бургера', 'бургеры', 'бургери'],
  pizza: ['pizza', 'pizzas', 'пицца', 'пиццу', 'пиццы', 'піца', 'піцу', 'піци'],
  pasta: ['pasta', 'паста', 'пасту', 'макароны', 'макарони'],
  sushi: ['sushi', 'суши', 'суші', 'роллы', 'роли'],
  ramen: ['ramen', 'рамен'],
  curry: ['curry', 'карри', 'карі'],
  soup: ['soup', 'soups', 'суп', 'супы', 'супи', 'борщ'],
  salad: ['salad', 'salads', 'салат', 'салаты', 'салати'],
  bowl: ['bowl', 'bowls', 'боул', 'боулы', 'боули'],
  sandwich: ['sandwich', 'sandwiches', 'сэндвич', 'сендвич'],
  wrap: ['wrap', 'wraps', 'рол', 'ролл'],
  kebab: ['kebab', 'kebabs', 'кебаб', 'шаурма', 'шаурму', 'шаверма'],
  steak: ['steak', 'steaks', 'стейк', 'стейки'],
  chicken: ['chicken', 'курица', 'курицу', 'курицы', 'курка', 'курку', 'курки'],
  beef: ['beef', 'говядина', 'говядину', 'яловичина', 'яловичину'],
  pork: ['pork', 'свинина', 'свинину'],
  lamb: ['lamb', 'баранина', 'баранину'],
  fish: ['fish', 'рыба', 'рыбу', 'риба', 'рибу'],
  salmon: ['salmon', 'лосось', 'лосося'],
  seafood: ['seafood', 'морепродукты', 'морепродукти'],
  shrimp: ['shrimp', 'prawn', 'prawns', 'креветки', 'креветок'],
  rice: ['rice', 'рис', 'рису'],
  potato: ['potato', 'potatoes', 'картошка', 'картошку', 'картопля', 'картоплю'],
  mushroom: ['mushroom', 'mushrooms', 'гриб', 'грибы', 'гриби'],
  tomato: ['tomato', 'tomatoes', 'помидор', 'помидоры', 'помідор', 'помідори'],
  avocado: ['avocado', 'авокадо'],
  cheese: ['cheese', 'сыр', 'сыра', 'сир', 'сиру'],
  egg: ['egg', 'eggs', 'яйцо', 'яйца', 'яйце', 'яйця'],
  bread: ['bread', 'хлеб', 'хліб'],
  taco: ['taco', 'tacos', 'тако'],
  dessert: ['dessert', 'desserts', 'десерт', 'десерты', 'десерти'],
  cake: ['cake', 'cakes', 'торт', 'торты', 'торти'],
  breakfast: ['breakfast', 'завтрак', 'сніданок'],
  lunch: ['lunch', 'обед', 'обід'],
  dinner: ['dinner', 'ужин', 'вечеря'],
  food: ['food', 'meal', 'meals', 'еда', 'еду', 'пища', 'їжа', 'їжу', 'страва', 'страву', 'страви'],
}

const words = new Map(Object.entries(aliases).flatMap(([canonical, forms]) =>
  forms.map((form) => [form, canonical]),
))

export function foodTerms(query) {
  const tokens = query.normalize('NFKC').toLocaleLowerCase('uk').match(/[\p{L}\p{N}]+/gu) ?? []
  const terms = tokens.flatMap((token) => words.has(token) ? [words.get(token)] : [])
  if (terms.length === 0 && query.trim().toLowerCase() === 'something spicy') terms.push('food')
  return [...new Set(terms)]
}
