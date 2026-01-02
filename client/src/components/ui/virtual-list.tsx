import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { cn } from '@/lib/utils'

export interface VirtualListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  itemHeight?: number
  estimatedItemHeight?: number
  overscan?: number
  className?: string
  containerClassName?: string
  direction?: 'vertical' | 'horizontal'
  onScroll?: (scrollOffset: number) => void
  onEndReached?: () => void
  endReachedThreshold?: number
  initialScrollOffset?: number
  scrollRestoreKey?: string
  keyExtractor?: (item: T, index: number) => string | number
  gap?: number
  role?: string
  ariaLabel?: string
}

export interface VirtualListRef {
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void
  scrollToOffset: (offset: number, behavior?: ScrollBehavior) => void
  getScrollOffset: () => number
  refresh: () => void
}

interface ItemMetadata {
  offset: number
  height: number
  measured: boolean
}

const scrollPositionCache = new Map<string, number>()

function VirtualListInner<T>(
  props: VirtualListProps<T>,
  ref: React.ForwardedRef<VirtualListRef>
) {
  const {
    items,
    renderItem,
    itemHeight,
    estimatedItemHeight = 50,
    overscan = 3,
    className,
    containerClassName,
    direction = 'vertical',
    onScroll,
    onEndReached,
    endReachedThreshold = 200,
    initialScrollOffset,
    scrollRestoreKey,
    keyExtractor,
    gap = 0,
    role = 'list',
    ariaLabel,
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [containerSize, setContainerSize] = useState(0)
  const itemMetadataRef = useRef<Map<number, ItemMetadata>>(new Map())
  const measurementCacheRef = useRef<Map<number, number>>(new Map())
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const itemElementsRef = useRef<Map<number, HTMLElement>>(new Map())
  const endReachedCalledRef = useRef(false)
  const [, forceUpdate] = useState({})

  const isHorizontal = direction === 'horizontal'

  const getItemMetadata = useCallback(
    (index: number): ItemMetadata => {
      const cached = itemMetadataRef.current.get(index)
      if (cached) return cached

      const height = itemHeight ?? measurementCacheRef.current.get(index) ?? estimatedItemHeight
      let offset = 0

      for (let i = 0; i < index; i++) {
        const prevMeta = itemMetadataRef.current.get(i)
        if (prevMeta) {
          offset = prevMeta.offset + prevMeta.height + gap
        } else {
          offset += (itemHeight ?? measurementCacheRef.current.get(i) ?? estimatedItemHeight) + gap
        }
      }

      const metadata: ItemMetadata = {
        offset,
        height,
        measured: itemHeight !== undefined || measurementCacheRef.current.has(index),
      }

      itemMetadataRef.current.set(index, metadata)
      return metadata
    },
    [itemHeight, estimatedItemHeight, gap]
  )

  const totalSize = useMemo(() => {
    if (items.length === 0) return 0
    const lastMeta = getItemMetadata(items.length - 1)
    return lastMeta.offset + lastMeta.height
  }, [items.length, getItemMetadata])

  const getVisibleRange = useCallback((): { start: number; end: number } => {
    if (items.length === 0) return { start: 0, end: 0 }

    let start = 0
    let end = items.length - 1

    let low = 0
    let high = items.length - 1
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const meta = getItemMetadata(mid)
      if (meta.offset + meta.height < scrollOffset) {
        low = mid + 1
      } else if (meta.offset > scrollOffset) {
        high = mid - 1
      } else {
        start = mid
        break
      }
    }
    start = Math.max(0, low - 1)

    const viewportEnd = scrollOffset + containerSize
    low = start
    high = items.length - 1
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const meta = getItemMetadata(mid)
      if (meta.offset > viewportEnd) {
        high = mid - 1
      } else {
        low = mid + 1
      }
    }
    end = Math.min(items.length - 1, high + 1)

    return {
      start: Math.max(0, start - overscan),
      end: Math.min(items.length - 1, end + overscan),
    }
  }, [items.length, scrollOffset, containerSize, overscan, getItemMetadata])

  const { start, end } = getVisibleRange()

  const measureItem = useCallback(
    (index: number, element: HTMLElement | null) => {
      if (!element || itemHeight !== undefined) return

      const prevElement = itemElementsRef.current.get(index)
      if (prevElement === element) return

      itemElementsRef.current.set(index, element)

      const measure = () => {
        const size = isHorizontal ? element.offsetWidth : element.offsetHeight
        const cachedSize = measurementCacheRef.current.get(index)

        if (cachedSize !== size) {
          measurementCacheRef.current.set(index, size)
          itemMetadataRef.current.delete(index)
          for (let i = index + 1; i < items.length; i++) {
            itemMetadataRef.current.delete(i)
          }
          forceUpdate({})
        }
      }

      measure()

      if (!resizeObserverRef.current) {
        resizeObserverRef.current = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const el = entry.target as HTMLElement
            const idx = parseInt(el.dataset.virtualIndex || '-1', 10)
            if (idx >= 0) {
              const size = isHorizontal ? entry.contentRect.width : entry.contentRect.height
              const cachedSize = measurementCacheRef.current.get(idx)
              if (cachedSize !== size) {
                measurementCacheRef.current.set(idx, size)
                itemMetadataRef.current.delete(idx)
                for (let i = idx + 1; i < items.length; i++) {
                  itemMetadataRef.current.delete(i)
                }
                forceUpdate({})
              }
            }
          }
        })
      }

      resizeObserverRef.current.observe(element)
    },
    [itemHeight, isHorizontal, items.length]
  )

  useEffect(() => {
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
      }
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const size = isHorizontal
          ? entry.contentRect.width
          : entry.contentRect.height
        setContainerSize(size)
      }
    })

    observer.observe(container)
    setContainerSize(isHorizontal ? container.offsetWidth : container.offsetHeight)

    return () => observer.disconnect()
  }, [isHorizontal])

  useEffect(() => {
    if (scrollRestoreKey && scrollPositionCache.has(scrollRestoreKey)) {
      const savedOffset = scrollPositionCache.get(scrollRestoreKey)!
      if (containerRef.current) {
        if (isHorizontal) {
          containerRef.current.scrollLeft = savedOffset
        } else {
          containerRef.current.scrollTop = savedOffset
        }
      }
    } else if (initialScrollOffset !== undefined && containerRef.current) {
      if (isHorizontal) {
        containerRef.current.scrollLeft = initialScrollOffset
      } else {
        containerRef.current.scrollTop = initialScrollOffset
      }
    }
  }, [scrollRestoreKey, initialScrollOffset, isHorizontal])

  useEffect(() => {
    return () => {
      if (scrollRestoreKey) {
        scrollPositionCache.set(scrollRestoreKey, scrollOffset)
      }
    }
  }, [scrollRestoreKey, scrollOffset])

  useEffect(() => {
    itemMetadataRef.current.clear()
    measurementCacheRef.current.clear()
    endReachedCalledRef.current = false
    forceUpdate({})
  }, [items])

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget
      const offset = isHorizontal ? target.scrollLeft : target.scrollTop
      setScrollOffset(offset)
      onScroll?.(offset)

      if (onEndReached && !endReachedCalledRef.current) {
        const scrollSize = isHorizontal ? target.scrollWidth : target.scrollHeight
        const clientSize = isHorizontal ? target.clientWidth : target.clientHeight
        if (scrollSize - offset - clientSize < endReachedThreshold) {
          endReachedCalledRef.current = true
          onEndReached()
        }
      }
    },
    [isHorizontal, onScroll, onEndReached, endReachedThreshold]
  )

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const container = containerRef.current
      if (!container || index < 0 || index >= items.length) return

      const meta = getItemMetadata(index)
      container.scrollTo({
        [isHorizontal ? 'left' : 'top']: meta.offset,
        behavior,
      })
    },
    [items.length, getItemMetadata, isHorizontal]
  )

  const scrollToOffset = useCallback(
    (offset: number, behavior: ScrollBehavior = 'smooth') => {
      const container = containerRef.current
      if (!container) return

      container.scrollTo({
        [isHorizontal ? 'left' : 'top']: offset,
        behavior,
      })
    },
    [isHorizontal]
  )

  const getScrollOffset = useCallback(() => scrollOffset, [scrollOffset])

  const refresh = useCallback(() => {
    itemMetadataRef.current.clear()
    forceUpdate({})
  }, [])

  useImperativeHandle(ref, () => ({
    scrollToIndex,
    scrollToOffset,
    getScrollOffset,
    refresh,
  }))

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const container = containerRef.current
      if (!container) return

      const step = itemHeight ?? estimatedItemHeight
      const pageStep = containerSize

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          if ((isHorizontal && e.key === 'ArrowRight') || (!isHorizontal && e.key === 'ArrowDown')) {
            e.preventDefault()
            scrollToOffset(scrollOffset + step, 'smooth')
          }
          break
        case 'ArrowUp':
        case 'ArrowLeft':
          if ((isHorizontal && e.key === 'ArrowLeft') || (!isHorizontal && e.key === 'ArrowUp')) {
            e.preventDefault()
            scrollToOffset(Math.max(0, scrollOffset - step), 'smooth')
          }
          break
        case 'PageDown':
          e.preventDefault()
          scrollToOffset(scrollOffset + pageStep, 'smooth')
          break
        case 'PageUp':
          e.preventDefault()
          scrollToOffset(Math.max(0, scrollOffset - pageStep), 'smooth')
          break
        case 'Home':
          e.preventDefault()
          scrollToOffset(0, 'smooth')
          break
        case 'End':
          e.preventDefault()
          scrollToOffset(totalSize - containerSize, 'smooth')
          break
      }
    },
    [isHorizontal, scrollOffset, scrollToOffset, itemHeight, estimatedItemHeight, containerSize, totalSize]
  )

  const visibleItems = useMemo(() => {
    const result: React.ReactNode[] = []

    for (let i = start; i <= end && i < items.length; i++) {
      const item = items[i]
      const meta = getItemMetadata(i)
      const key = keyExtractor ? keyExtractor(item, i) : i

      result.push(
        <div
          key={key}
          ref={(el) => measureItem(i, el)}
          data-virtual-index={i}
          role="listitem"
          style={{
            position: 'absolute',
            [isHorizontal ? 'left' : 'top']: meta.offset,
            [isHorizontal ? 'top' : 'left']: 0,
            [isHorizontal ? 'height' : 'width']: '100%',
            ...(itemHeight !== undefined
              ? { [isHorizontal ? 'width' : 'height']: itemHeight }
              : {}),
          }}
          className=""
        >
          {renderItem(item, i)}
        </div>
      )
    }

    return result
  }, [start, end, items, getItemMetadata, keyExtractor, measureItem, isHorizontal, itemHeight, renderItem])

  return (
    <div
      ref={containerRef}
      role={role}
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative outline-none overflow-auto',
        isHorizontal ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto overflow-x-hidden',
        'touch-pan-x touch-pan-y',
        '-webkit-overflow-scrolling-touch',
        'scroll-smooth',
        'scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent',
        className
      )}
      style={{
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        className={cn('relative', containerClassName)}
        style={{
          [isHorizontal ? 'width' : 'height']: totalSize,
          [isHorizontal ? 'height' : 'width']: '100%',
          minHeight: isHorizontal ? undefined : 1,
          minWidth: isHorizontal ? 1 : undefined,
        }}
      >
        {visibleItems}
      </div>
    </div>
  )
}

export const VirtualList = forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.ForwardedRef<VirtualListRef> }
) => React.ReactElement

export interface VirtualGridProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  columnCount: number
  rowHeight: number
  estimatedRowHeight?: number
  overscan?: number
  className?: string
  gap?: number
  keyExtractor?: (item: T, index: number) => string | number
}

export function VirtualGrid<T>({
  items,
  renderItem,
  columnCount,
  rowHeight,
  estimatedRowHeight = 100,
  overscan = 2,
  className,
  gap = 0,
  keyExtractor,
}: VirtualGridProps<T>) {
  const rows = useMemo(() => {
    const result: T[][] = []
    for (let i = 0; i < items.length; i += columnCount) {
      result.push(items.slice(i, i + columnCount))
    }
    return result
  }, [items, columnCount])

  const renderRow = useCallback(
    (row: T[], rowIndex: number) => (
      <div
        className="flex"
        style={{ gap }}
      >
        {row.map((item, colIndex) => {
          const itemIndex = rowIndex * columnCount + colIndex
          const key = keyExtractor ? keyExtractor(item, itemIndex) : itemIndex
          return (
            <div
              key={key}
              style={{ flex: `1 1 calc(${100 / columnCount}% - ${(gap * (columnCount - 1)) / columnCount}px)` }}
            >
              {renderItem(item, itemIndex)}
            </div>
          )
        })}
        {row.length < columnCount &&
          Array.from({ length: columnCount - row.length }).map((_, i) => (
            <div
              key={`empty-${i}`}
              style={{ flex: `1 1 calc(${100 / columnCount}% - ${(gap * (columnCount - 1)) / columnCount}px)` }}
            />
          ))}
      </div>
    ),
    [columnCount, gap, keyExtractor, renderItem]
  )

  return (
    <VirtualList
      items={rows}
      renderItem={renderRow}
      itemHeight={rowHeight}
      estimatedItemHeight={estimatedRowHeight}
      overscan={overscan}
      className={className}
      gap={gap}
    />
  )
}

export function useVirtualList<T>(items: T[], options: Omit<VirtualListProps<T>, 'items' | 'renderItem'> = {}) {
  const listRef = useRef<VirtualListRef>(null)

  const scrollToIndex = useCallback((index: number, behavior?: ScrollBehavior) => {
    listRef.current?.scrollToIndex(index, behavior)
  }, [])

  const scrollToTop = useCallback((behavior?: ScrollBehavior) => {
    listRef.current?.scrollToOffset(0, behavior)
  }, [])

  const scrollToBottom = useCallback((behavior?: ScrollBehavior) => {
    if (items.length > 0) {
      listRef.current?.scrollToIndex(items.length - 1, behavior)
    }
  }, [items.length])

  const refresh = useCallback(() => {
    listRef.current?.refresh()
  }, [])

  return {
    listRef,
    scrollToIndex,
    scrollToTop,
    scrollToBottom,
    refresh,
    listProps: {
      items,
      ...options,
    },
  }
}

export default VirtualList
