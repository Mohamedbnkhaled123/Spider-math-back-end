import { z } from 'zod';

export const watchHeartbeatDtoSchema = z.object({
  currentPlaybackSec: z.number().min(0, 'currentPlaybackSec cannot be negative'),
  isCompleted: z.boolean().optional(),
  chunkIndex: z.number().optional(),
  watchedChunks: z.array(z.number()).optional(),
  actualDurationSec: z.number().optional(),
  videoDurationSec: z.number().optional()
});

export type WatchHeartbeatDto = z.infer<typeof watchHeartbeatDtoSchema>;
