import { quickPrompts } from '../../entities/order/model'

export function PromptHero({ query, loading, onQueryChange, onSubmit }) {
  return (
    <section className="hero-panel relative mt-3 overflow-hidden rounded-[2rem] px-6 py-10 sm:px-12 sm:py-14">
      <div className="relative z-10 max-w-2xl">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-[#476c49]">Great food starts with a craving</p>
        <h1 className="font-display text-4xl font-semibold leading-[1.07] tracking-tight text-[#233126] sm:text-6xl">What sounds<br /><span className="serif-italic text-[#557958]">good today?</span></h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-[#596257] sm:text-lg">Tell us what you’re in the mood for. We’ll find the perfect bite.</p>
        <form className="mt-8 flex max-w-xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-[0_12px_40px_rgba(52,68,49,0.12)] focus-within:ring-2 focus-within:ring-[#a7bba2] sm:flex-row" onSubmit={onSubmit}>
          <label className="flex min-w-0 flex-1 items-center gap-3 px-3"><span aria-hidden="true" className="text-xl text-[#7d8d79]">✳</span><input aria-label="What would you like to eat?" className="search-input w-full border-0 bg-transparent py-3 text-base text-[#20251f] outline-none placeholder:text-[#9b9f98]" onChange={(event) => onQueryChange(event.target.value)} placeholder="Try a creamy mushroom pasta" value={query} /></label>
          <button className="primary-button flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#38593c] disabled:cursor-wait disabled:opacity-70" disabled={loading} aria-busy={loading} type="submit">
            Find my food
            {loading ? <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin" aria-hidden="true" /> : <span aria-hidden="true">↗</span>}
          </button>
        </form>
        <div role="status" aria-live="polite">
          {loading && <p className="mt-4 flex items-center gap-2 text-sm text-[#456749]"><span aria-hidden="true" className="motion-safe:animate-pulse">✦</span> Our AI-assisted search is looking for your food <span className="inline-flex gap-1" aria-hidden="true"><span className="h-1 w-1 rounded-full bg-current motion-safe:animate-bounce" /><span className="h-1 w-1 rounded-full bg-current motion-safe:animate-bounce [animation-delay:150ms]" /><span className="h-1 w-1 rounded-full bg-current motion-safe:animate-bounce [animation-delay:300ms]" /></span></p>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#737b71]"><span className="mr-1">Try:</span>{quickPrompts.map((prompt) => <button className="rounded-full border border-[#d9dfd6] bg-white/70 px-3 py-1.5 transition hover:border-[#8da38a] hover:bg-white" key={prompt} onClick={() => onQueryChange(prompt)} type="button">{prompt}</button>)}</div>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="hero-orbit" /><div className="hero-plate"><span className="plate-food">🥗</span></div><span className="art-leaf leaf-one">✦</span><span className="art-leaf leaf-two">✿</span><span className="art-spark">✳</span></div>
    </section>
  )
}
