<!--
  Test host for the GTFS bind + lifecycle pair. The composables register
  `$effect`s, so they need a real component context (an effect root) to
  run in - mounting this host is the cheapest way to get one without
  pulling a DOM renderer into the test.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useGtfsBind } from './useGtfsBind.svelte';
  import { useGtfsLifecycle } from './useGtfsLifecycle.svelte';

  let {
    onReady,
  }: {
    onReady: (api: {
      suspend: () => void;
      resume: () => void;
    }) => void;
  } = $props();

  const gtfs = useGtfsBind();
  const lifecycle = useGtfsLifecycle(gtfs);

  $effect(() => {
    untrack(() => onReady(lifecycle));
  });
</script>
