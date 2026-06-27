<!--
  AppLayout — overall page shell: Header + StatusBar + scrollable main +
  fixed BottomNavigation. All routes wrap their content in this via
  +layout.svelte; per-route specifics (title, nav active) are passed in.

  The main element gets bottom padding (pb-20) so the fixed BottomNavigation
  doesn't cover the last content row. Top safe-area inset is added inside
  Header (so the colored band extends into the notch on iOS).
-->
<script lang="ts" generics="T extends string">
  import type { Snippet } from 'svelte';
  import BottomNavigation from './BottomNavigation.svelte';
  import Header from './Header.svelte';
  import type { HeaderHealth } from './headerTypes';
  import StatusBar from './StatusBar.svelte';

  type NavItem = {
    value: T;
    label: string;
    icon: Snippet;
  };

  type Props = {
    title: string;
    health: HeaderHealth;
    onrefresh?: () => void;
    refreshing?: boolean;
    navItems: readonly NavItem[];
    activeNav: T;
    onnav: (next: T) => void;
    children?: Snippet;
  };

  let {
    title,
    health,
    onrefresh,
    refreshing = false,
    navItems,
    activeNav,
    onnav,
    children,
  }: Props = $props();
</script>

<div class="min-h-svh flex flex-col bg-[color:var(--color-bg)] text-[color:var(--color-fg)]">
  <Header {title} {health} {onrefresh} {refreshing} />
  <StatusBar />
  <!-- Bottom padding clears the fixed BottomNavigation (h-14 ≈ 56 px)
       PLUS the iOS home-indicator inset. Without var(--space-safe-bottom)
       in this calc, the last content row on iPhones with a home
       indicator gets covered by the inset (since the nav itself pads
       up by safe-bottom, the page must too). -->
  <main class="flex-1 overflow-x-hidden pb-[calc(3.5rem+var(--space-safe-bottom))]">
    {@render children?.()}
  </main>
  <BottomNavigation
    value={activeNav}
    onchange={onnav}
    items={navItems}
  />
</div>
