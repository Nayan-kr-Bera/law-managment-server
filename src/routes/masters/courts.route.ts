import express from 'express';
import auth from '../../middleware/auth.js';
import courtsController from '../../controller/master/courts.controller.js';


const router = express.Router();

router.post('/create',auth,courtsController.createcourts);
router.put('/update/:id',auth,courtsController.updatecourts);
router.delete('/delete/:id',auth,courtsController.deletecourts);
router.get('/',auth,courtsController.getcourts);

export default router;