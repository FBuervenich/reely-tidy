import type { ObjectDirective } from 'vue'

const observers = new WeakMap<HTMLElement, ResizeObserver>()

/** Publish the rendered height so stacked sticky elements also work with wrapping text. */
export const vStickyHeight: ObjectDirective<HTMLElement, string> = {
  mounted(element, { value }) {
    const workspace = element.closest<HTMLElement>('.renamer-page')
    if (!workspace) return
    const update = () => {
      workspace.style.setProperty(value, `${element.getBoundingClientRect().height}px`)
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    observers.set(element, observer)
    update()
  },
  unmounted(element) {
    observers.get(element)?.disconnect()
    observers.delete(element)
  },
}
