import express from 'express';
import auth from '../../middleware/auth.js';
import underSectionController from '../../controller/master/underSection.controller.js';


const router = express.Router();

router.post('/create',auth,underSectionController.createunderSection);
router.put('/update/:id',auth,underSectionController.updateunderSection);
router.delete('/delete/:id',auth,underSectionController.deleteunderSection);
router.get('/',auth,underSectionController.getunderSections);

export default router;