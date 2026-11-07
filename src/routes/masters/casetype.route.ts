import express from 'express';
import caseTypeController from '../../controller/master/caseTypes.controller.js';
import auth from '../../middleware/auth.js';
import { permissionGuard } from '../../middleware/permission.js';

const router = express.Router();

router.post('/create', auth, permissionGuard("case_type.create"), caseTypeController.createcaseType);
router.put('/update/:id', auth, permissionGuard("case_type.update"), caseTypeController.updatecaseType);
router.delete('/delete/:id', auth, permissionGuard("case_type.delete"), caseTypeController.deleteCaseType);
router.get('/', auth, caseTypeController.getcaseTypes);

export default router;