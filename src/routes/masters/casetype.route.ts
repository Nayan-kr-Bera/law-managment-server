import express from 'express';
import caseTypeController from '../../controller/master/caseTypes.controller.js';
import auth from '../../middleware/auth.js';


const router = express.Router();

router.post('/create',auth,caseTypeController.createcaseType);
router.put('/update/:id',auth,caseTypeController.updatecaseType);
router.delete('/delete/:id',auth,caseTypeController.deleteCaseType);
router.get('/',auth,caseTypeController.getcaseTypes);

export default router;