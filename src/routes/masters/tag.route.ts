import express from 'express';
import auth from '../../middleware/auth.js';
import tagController from '../../controller/master/tags.controller.js';


const router = express.Router();

router.post('/create',auth,tagController.createtag);
router.put('/update/:id',auth,tagController.updatetag);
router.delete('/delete/:id',auth,tagController.deletetag);
router.get('/',auth,tagController.gettags);

export default router;