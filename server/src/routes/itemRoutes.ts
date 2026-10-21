import { Router } from 'express';
import {
  createItem,
  getItems,
  getTags,
  getItemById,
  deleteItem,
  analyzeItem,
} from '../controllers/itemController';

const router = Router();

// POST /api/items — Capture a shared video URL
router.post('/', createItem);

// GET /api/items — List saved items with filters and search
router.get('/', getItems);

// GET /api/items/tags — List unique tags and usage counts
router.get('/tags', getTags);

// GET /api/items/:id — Get a single saved item
router.get('/:id', getItemById);

// POST /api/items/:id/analyze — Analyze or re-analyze a saved item
router.post('/:id/analyze', analyzeItem);

// DELETE /api/items/:id — Delete a saved item
router.delete('/:id', deleteItem);

export default router;
