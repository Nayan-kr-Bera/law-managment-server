import express from 'express';
import auth from '../../middleware/auth.js';
import empanelmentsController from '../../controller/master/empanelments.controller.js';


const router = express.Router();

router.post('/create',auth,empanelmentsController.createempanelments);
router.put('/update/:id',auth,empanelmentsController.updateempanelments);
router.delete('/delete/:id',auth,empanelmentsController.deleteempanelments);
router.get('/',auth,empanelmentsController.getempanelments);

export default router;