import { z } from 'zod';

export const watchHeartbeatDtoSchema = z.object({
  currentPlaybackSec: z.number().min(0, 'currentPlaybackSec cannot be negative'),
  chunkIndex: z.number().int().min(0, 'chunkIndex must be a non-negative integer').optional(),
  watchedChunks: z.array(z.number().int().min(0)).optional(),
  actualDurationSec: z.number().positive().optional(),
  videoDurationSec: z.number().positive().optional()
});

export type WatchHeartbeatDto = z.infer<typeof watchHeartbeatDtoSchema>;
