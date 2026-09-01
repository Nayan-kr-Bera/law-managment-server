import express from 'express';
import auth from '../../middleware/auth.js';
import companiesController from '../../controller/master/companies.controller.js';


const router = express.Router();

router.get('/',auth,companiesController.getcompanies);
router.post('/create',auth,companiesController.createcompanie);
router.put('/update/:id',auth,companiesController.updatecompanie);
router.delete('/delete/:id',auth,companiesController.deletecompanie);

export default router;