import { CartIcon } from './CartIcon'
import { formatPrice } from '../../shared/lib/formatPrice'

export function CartPage({ items, selectedIds, onBack, onRemove, onSelectionChange, onCheckout }) {
  const selectedItems = items.filter((item) => selectedIds.includes(item.id))
  const total = selectedItems.reduce((sum, item) => sum + Number(item.price), 0)
  const allSelected = selectedItems.length === items.length

  return (
    <main className="mx-auto w-full max-w-7xl px-5 pb-20 sm:px-8">
      <button className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#d9e1d5] bg-white px-4 py-2.5 text-sm font-semibold text-[#456b49] shadow-sm hover:bg-[#eef2eb]" onClick={onBack} type="button">
        <span aria-hidden="true">←</span> Back to menu
      </button>
      <div className="mx-auto max-w-3xl">
        <p className="section-kicker">Your selection</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Shopping cart</h1>
        {!items.length ? (
          <div className="mt-8 rounded-3xl border border-[#e5e9e1] bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#eef2eb] text-[#456b49]"><CartIcon className="h-8 w-8" /></div>
            <h2 className="mt-5 font-display text-2xl font-semibold">Your cart is waiting</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#777e74]">Pick something delicious from the menu and it will appear here.</p>
            <button className="primary-button mt-6 rounded-xl px-5 py-3 text-sm font-semibold text-white hover:bg-[#38593c]" onClick={onBack} type="button">Explore the menu</button>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {items.some((item) => item.id.startsWith('generated-')) && <p className="text-sm text-[#626960]">Search results may expire after a server restart. If a dish is unavailable, search for it again.</p>}
            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-[#456749]">
              <input type="checkbox" checked={allSelected} onChange={(event) => onSelectionChange(event.target.checked ? items.map((item) => item.id) : [])} />
              Select all
            </label>
            {items.map((item) => (
              <article className={`flex items-center justify-between gap-4 rounded-2xl border bg-white p-4 shadow-sm transition ${selectedIds.includes(item.id) ? 'border-[#789576] ring-2 ring-[#e5eee2]' : 'border-[#e5e9e1]'}`} key={item.id}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => onSelectionChange(event.target.checked ? [...selectedIds, item.id] : selectedIds.filter((id) => id !== item.id))} />
                  <span>
                    <span className="block text-xs text-[#7d8378]">{item.restaurant}</span>
                    <span className="mt-1 block font-display text-lg font-semibold">{item.name}</span>
                  </span>
                </label>
                <div className="flex items-center gap-4">
                  <strong>{formatPrice(item.price)}</strong>
                  <button aria-label={`Remove ${item.name}`} className="rounded-full px-2 py-1 text-xl text-[#899187] hover:bg-[#fff1ed] hover:text-[#a04532]" onClick={() => onRemove(item.id)} type="button">×</button>
                </div>
              </article>
            ))}
            <div className="flex items-center justify-between rounded-2xl bg-[#e9eee2] p-5 text-lg font-semibold">
              <span>Selected total</span><span>{formatPrice(total)}</span>
            </div>
            {selectedItems.length > 100 && <p className="text-sm text-[#a04532]" role="alert">Select at most 100 dishes per order.</p>}
            <button className="primary-button w-full rounded-xl px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#38593c] disabled:cursor-not-allowed disabled:opacity-50" disabled={!selectedItems.length || selectedItems.length > 100} onClick={() => onCheckout(selectedItems)} type="button">
              {selectedItems.length ? `Checkout selected (${selectedItems.length})` : 'Select an item to checkout'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
