import { orderHeadings, statusSteps } from '../../entities/order/model'
<<<<<<< HEAD

export function OrderStatus({ order, trackingError }) {
  const currentStep = statusSteps.findIndex((step) => step.key === order.status)
  return <section className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(41,54,39,0.06)] sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="section-kicker">Your order</p><h2 className="mt-1 font-display text-2xl font-semibold">{orderHeadings[order.status] || 'Your order'}</h2></div><span className="status-live"><span /> Demo tracker</span></div><div className="mt-5 rounded-xl bg-[#f4f6f1] p-4"><p className="text-xs text-[#7c8377]">Tracking number</p><p className="mt-1 font-mono text-lg font-bold tracking-wide">{order.trackingNumber}</p></div><p className="mt-4 font-medium">{order.item.name}</p><p className="mt-1 text-sm text-[#777e74]">Delivering to: {order.address}</p><div className="mt-6 space-y-0">{statusSteps.map((step, index) => { const complete = index <= currentStep; return <div className="status-step" key={step.key}><div className={`status-dot ${complete ? 'status-dot-complete' : ''}`}>{complete ? '✓' : ''}</div><div className="pb-5"><p className={`text-sm font-semibold ${complete ? 'text-[#365a3b]' : 'text-[#a4aaa1]'}`}>{step.label}</p>{index === currentStep && <p className="mt-1 text-xs leading-5 text-[#838a80]">{step.detail}</p>}</div></div> })}</div>{order.status === 'on_the_way' && <div className="courier-card mt-1 flex items-center gap-3 rounded-xl p-3"><div className="courier-avatar">🛵</div><div className="flex-1"><p className="text-sm font-semibold">Alex · your courier</p><p className="text-xs text-[#7d8378]">Demo ride · status updates automatically</p></div><span className="text-sm font-semibold">4.9 ★</span></div>}<p className="mt-4 border-t border-[#eceee9] pt-4 text-center text-xs leading-5 text-[#888e85]">Courier updates are simulated and don’t reflect a real delivery.</p>{trackingError && <p className="mt-3 text-center text-xs text-[#a04532]" role="status">{trackingError}</p>}</section>
=======
import { formatPrice } from '../../shared/lib/formatPrice'

export function OrderStatus({ order, trackingError }) {
  const currentStep = statusSteps.findIndex((step) => step.key === order.status)
  const items = order.items ?? [order.item]
  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(41,54,39,0.06)] sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="section-kicker">Your order</p><h2 className="mt-1 font-display text-2xl font-semibold">{orderHeadings[order.status] || 'Your order'}</h2></div><span className="status-live"><span /> Demo tracker</span></div>
      <div className="mt-5 rounded-xl bg-[#f4f6f1] p-4"><p className="text-xs text-[#7c8377]">Tracking number</p><p className="mt-1 font-mono text-lg font-bold tracking-wide">{order.trackingNumber}</p></div>
      <ul className="mt-4 font-medium">{items.map((item) => <li key={item.id}>{item.name} · {formatPrice(item.price)}</li>)}</ul>
      {order.items && <p className="mt-2 text-sm font-semibold">Total: {formatPrice(order.totalAmount)}</p>}
      <p className="mt-1 text-sm text-[#777e74]">Delivering to: {order.address}</p>
      <div className="mt-6 space-y-0">{statusSteps.map((step, index) => {
        const complete = index <= currentStep
        return <div className="status-step" key={step.key}><div className={`status-dot ${complete ? 'status-dot-complete' : ''}`}>{complete ? '✓' : ''}</div><div className="pb-5"><p className={`text-sm font-semibold ${complete ? 'text-[#365a3b]' : 'text-[#a4aaa1]'}`}>{step.label}</p>{index === currentStep && <p className="mt-1 text-xs leading-5 text-[#838a80]">{step.detail}</p>}</div></div>
      })}</div>
      {order.status === 'on_the_way' && <div className="courier-card mt-1 flex items-center gap-3 rounded-xl p-3"><div className="courier-avatar">🛵</div><div className="flex-1"><p className="text-sm font-semibold">Alex · your courier</p><p className="text-xs text-[#7d8378]">Demo ride · status updates automatically</p></div><span className="text-sm font-semibold">4.9 ★</span></div>}
      <p className="mt-4 border-t border-[#eceee9] pt-4 text-center text-xs leading-5 text-[#888e85]">Courier updates are simulated and don’t reflect a real delivery.</p>
      {trackingError && <p className="mt-3 text-center text-xs text-[#a04532]" role="status">{trackingError}</p>}
    </section>
  )
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
}
