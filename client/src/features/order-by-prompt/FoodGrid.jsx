import { formatPrice } from '../../shared/lib/formatPrice'

<<<<<<< HEAD
export function FoodGrid({ items, selectedItem, error, onSelect }) {
=======
export function FoodGrid({ items, selectedItem, error, loading, onSelect }) {
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
  return (
    <section aria-live="polite">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="section-kicker">Picked for you</p><h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{items.length ? 'Here’s what we found' : 'Tasty ideas nearby'}</h2></div><span className="text-sm text-[#7b8178]">{items.length ? `${items.length} options` : 'A little chef inspiration'}</span></div>
      {error && <p className="mb-4 rounded-xl bg-[#fff1ed] px-4 py-3 text-sm text-[#a04532]" role="alert">{error}</p>}
<<<<<<< HEAD
      {!items.length && <div className="mb-5 rounded-2xl border border-[#e7e8e2] bg-white px-5 py-4 text-sm leading-6 text-[#72796f]">Choose a dish you like, or tell us what you’re craving above — like “a filling chicken lunch.”</div>}
=======
      {!items.length && !error && !loading && <div className="mb-5 rounded-2xl border border-[#e7e8e2] bg-white px-5 py-4 text-sm leading-6 text-[#72796f]">Choose a dish you like, or tell us what you’re craving above — like “a filling chicken lunch.”</div>}
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
      <div className="grid gap-4 sm:grid-cols-2">{items.map((item) => <article className={`food-card overflow-hidden rounded-2xl bg-white transition ${selectedItem?.id === item.id ? 'food-card-selected' : ''}`} key={item.id}><div className="food-photo-wrap"><img alt="" className="food-photo" loading="lazy" src={`https://images.unsplash.com/${item.image}?auto=format&fit=crop&w=800&q=80`} /><span className="food-tag">{item.tag}</span><span className="rating-badge">★ {item.rating}</span></div><div className="p-4"><p className="text-xs font-medium text-[#7d8378]">{item.restaurant} <span className="mx-1">·</span> {item.time}</p><h3 className="mt-1 font-display text-lg font-semibold leading-snug">{item.name}</h3><p className="mt-1 min-h-10 text-sm leading-5 text-[#777e74]">{item.description}</p><div className="mt-4 flex items-center justify-between"><span className="font-semibold">{formatPrice(item.price)}</span><button aria-pressed={selectedItem?.id === item.id} className={`select-button rounded-full px-4 py-2 text-sm font-semibold transition ${selectedItem?.id === item.id ? 'bg-[#385c3e] text-white' : 'bg-[#eef2eb] text-[#456749] hover:bg-[#dfe8dc]'}`} onClick={() => onSelect(item)} type="button">{selectedItem?.id === item.id ? 'Selected ✓' : 'Choose'}</button></div></div></article>)}</div>
    </section>
  )
}
