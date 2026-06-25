<!--
  Settings — user preferences. Theme picker, behavior toggles, and the
  agency selector (Phase 3 ships a placeholder selector — wired to a real
  agency list from neary-gtfs in the next batch). Advanced settings
  (storage, API key, force reload, version, debug toggles) live at
  /settings/advanced — placeholder linked at the bottom for now.
-->
<script lang="ts">
  import { Locate, Moon, Sun } from 'lucide-svelte';
  import {
    Box, Button, Card, CardContent, Stack,
    Switch, TextField, ToggleGroup, Typography,
  } from '$lib/ui';
  import { userPrefs, type Theme } from '$lib/stores/userPrefs.svelte';
</script>

<div class="mx-auto max-w-3xl px-4 py-6 space-y-6">
  <!-- ===== Theme ===== -->
  <Card>
    <CardContent>
      <Stack spacing={1.5}>
        <Typography variant="h6">Theme</Typography>
        <ToggleGroup
          value={userPrefs.theme}
          onchange={(v: Theme) => (userPrefs.theme = v)}
          items={[
            { value: 'light', label: 'Light', icon: sunIcon },
            { value: 'auto', label: 'Auto', icon: autoIcon },
            { value: 'dark', label: 'Dark', icon: moonIcon },
          ]}
        />
        <Typography variant="caption">
          Auto follows your system preference (changes when iOS toggles dark mode).
        </Typography>
      </Stack>
    </CardContent>
  </Card>

  <!-- ===== Agency ===== -->
  <Card>
    <CardContent>
      <Stack spacing={1.5}>
        <Typography variant="h6">Transit agency</Typography>
        <Stack direction="row" align="center" justify="between">
          <Typography variant="body2">
            {userPrefs.agencyId == null
              ? 'No agency selected.'
              : `Agency ${userPrefs.agencyId} selected.`}
          </Typography>
          {#if userPrefs.agencyId == null}
            <Button size="small" onclick={() => (userPrefs.agencyId = 2)}>
              Use CTP Cluj (id 2)
            </Button>
          {:else}
            <Button size="small" variant="outlined" color="danger" onclick={() => (userPrefs.agencyId = null)}>
              Clear
            </Button>
          {/if}
        </Stack>
        <Typography variant="caption">
          Phase 3 placeholder. The real picker (with agency list from neary-gtfs
          and download progress) lands in the next batch.
        </Typography>
      </Stack>
    </CardContent>
  </Card>

  <!-- ===== Display toggles ===== -->
  <Card>
    <CardContent>
      <Stack spacing={2}>
        <Typography variant="h6">Display</Typography>

        <Stack direction="row" align="center" justify="between">
          <Box class="flex-1 min-w-0">
            <Typography variant="body2">Show "Drop off only" indicators</Typography>
            <Typography variant="caption">Flag stations / vehicles that don't pick up passengers.</Typography>
          </Box>
          <Switch
            checked={userPrefs.showDropOffOnly}
            onchange={(v) => (userPrefs.showDropOffOnly = v)}
            aria-label="Show drop-off-only indicators"
          />
        </Stack>

        <Stack direction="row" align="center" justify="between">
          <Box class="flex-1 min-w-0">
            <Typography variant="body2">Show ghost vehicles</Typography>
            <Typography variant="caption">Scheduled runs whose GPS is currently missing.</Typography>
          </Box>
          <Switch
            checked={userPrefs.showGhostVehicles}
            onchange={(v) => (userPrefs.showGhostVehicles = v)}
            aria-label="Show ghost vehicles"
          />
        </Stack>
      </Stack>
    </CardContent>
  </Card>

  <!-- ===== Live tracking ===== -->
  <Card>
    <CardContent>
      <Stack spacing={1.5}>
        <Typography variant="h6">Live tracking (optional)</Typography>
        <TextField
          label="Tranzy API key"
          placeholder="Paste your API key to enable live vehicle tracking"
          value={userPrefs.apiKey ?? ''}
          oninput={(e) => (userPrefs.apiKey = (e.currentTarget as HTMLInputElement).value || null)}
          helperText="Optional — without it, the app runs in schedule-only mode."
        />
      </Stack>
    </CardContent>
  </Card>

  <!-- ===== Advanced placeholder ===== -->
  <Card>
    <CardContent>
      <Stack spacing={1}>
        <Typography variant="h6">Advanced</Typography>
        <Typography variant="caption">
          Storage breakdown, data freshness, force schedule reload, app version,
          and debug toggles live here in a separate view (lands with Phase 7).
        </Typography>
      </Stack>
    </CardContent>
  </Card>
</div>

{#snippet sunIcon()}<Sun size={16} />{/snippet}
{#snippet autoIcon()}<Locate size={16} />{/snippet}
{#snippet moonIcon()}<Moon size={16} />{/snippet}