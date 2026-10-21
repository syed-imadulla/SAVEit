import { Router } from 'express';
import {
  createItem,
  getItems,
  getItemById,
  deleteItem,
} from '../controllers/itemController';

const router = Router();

// POST /api/items — Capture a shared video URL
router.post('/', createItem);

// GET /api/items — List saved items with filters
router.get('/', getItems);

// GET /api/items/:id — Get a single saved item
router.get('/:id', getItemById);

// DELETE /api/items/:id — Delete a saved item
router.delete('/:id', deleteItem);

export default router;
