import express from 'express';
import customFieldsController from '../../controller/master/customFields.controller.js';
import auth from '../../middleware/auth.js';


const router = express.Router();

router.post('/create',auth,customFieldsController.createCustomField);
router.put('/update/:id',auth,customFieldsController.updateCustomField);
router.delete('/delete/:id',auth,customFieldsController.deleteCustomField);
router.get('/',auth,customFieldsController.getCustomFields);


export default router;