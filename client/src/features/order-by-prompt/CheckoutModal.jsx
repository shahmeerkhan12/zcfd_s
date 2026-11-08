import { formatPrice } from '../../shared/lib/formatPrice'

export function CheckoutModal({ items, form, setForm, error, placing, onClose, onSubmit }) {
  const total = items.reduce((sum, item) => sum + Number(item.price), 0)

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (!placing && event.target === event.currentTarget) onClose() }}>
      <section aria-labelledby="checkout-title" aria-modal="true" className="checkout-modal" role="dialog">
        <button aria-label="Close" className="modal-close" disabled={placing} onClick={onClose} type="button">×</button>
        <p className="section-kicker">Just one more step</p>
        <h2 className="mt-1 font-display text-3xl font-semibold" id="checkout-title">Where should we deliver?</h2>
        <ul className="mt-2 text-sm text-[#777e74]">
          {items.map((item) => <li key={item.id}>{item.name} · {formatPrice(item.price)}</li>)}
        </ul>
        {items.length > 1 && <p className="mt-2 text-xs text-[#777e74]">This demo order is stored until the server restarts.</p>}
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="form-field"><span>Your name</span><input autoComplete="name" minLength="2" onChange={(event) => setForm({ ...form, customerName: event.target.value })} placeholder="How should we address you?" required value={form.customerName} /></label>
          <label className="form-field"><span>Delivery address</span><input autoComplete="street-address" minLength="5" onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Street, building, apartment" required value={form.address} /></label>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Payment method</legend>
            {[['on_delivery', 'Pay on delivery', 'Pay your courier · demo only', '💵'], ['demo_card', 'Demo card payment', 'Simulation only · no charge', '💳']].map(([value, title, detail, icon]) => (
              <label className={`payment-option ${form.paymentMethod === value ? 'payment-option-active' : ''}`} key={value}>
                <input checked={form.paymentMethod === value} name="payment" onChange={() => setForm({ ...form, paymentMethod: value })} type="radio" />
                <span><strong>{title}</strong><small>{detail}</small></span><span className="ml-auto">{icon}</span>
              </label>
            ))}
            <p className="mt-2 text-xs leading-5 text-[#858b82]">Don’t enter card details: real payments aren’t enabled.</p>
          </fieldset>
          {error && <p className="rounded-lg bg-[#fff1ed] px-3 py-2 text-sm text-[#a04532]" role="alert">{error}</p>}
          <button className="primary-button w-full rounded-xl px-5 py-3.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70" disabled={placing} type="submit">{placing ? 'Placing order…' : `Place order · ${formatPrice(total)}`}</button>
        </form>
      </section>
    </div>
  )
}
