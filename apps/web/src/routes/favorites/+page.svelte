<!--
  Favorites — placeholder. Real implementation in Phase 6 (route-context
  card list, same shell as Stations). Until then we just show the same
  empty-state pattern as Stations when no agency is selected.
-->
<script lang="ts">
  import { Heart } from 'lucide-svelte';
  import { Card, CardContent, Stack, Typography } from '$lib/ui';
  import { userPrefs } from '$lib/stores/userPrefs.svelte';
</script>

<div class="mx-auto max-w-3xl px-4 py-6">
  <Card>
    <CardContent>
      <Stack spacing={1.5} align="center" class="text-center">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[color:var(--color-danger)]/10 text-[color:var(--color-danger)]">
          <Heart size={24} />
        </div>
        <Typography variant="h4">Favorites</Typography>
        <Typography variant="body2" class="max-w-prose text-[color:var(--color-fg-muted)]">
          {userPrefs.agencyId == null
            ? 'Pick an agency in Settings first; then star routes from a station card to see them here.'
            : 'No favorites yet. Tap the heart on any route badge to add it.'}
        </Typography>
      </Stack>
    </CardContent>
  </Card>
</div>