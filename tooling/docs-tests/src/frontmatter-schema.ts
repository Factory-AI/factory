import { z } from 'zod';

export const frontmatterSchema = z
  .object({
    title: z
      .string({ required_error: 'title is required' })
      .trim()
      .min(1, 'title cannot be empty'),
    description: z
      .string({ required_error: 'description is required' })
      .trim()
      .min(1, 'description cannot be empty'),
    keywords: z.array(z.string().trim().min(1)).optional(),
    sidebarTitle: z.string().trim().min(1).optional(),
    rss: z.boolean().optional(),
  })
  .passthrough();

export type Frontmatter = z.infer<typeof frontmatterSchema>;
