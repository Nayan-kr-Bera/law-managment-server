import express from 'express';
import auth from '../../middleware/auth.js';
import policeStationController from '../../controller/master/policeStation.controller.js';


const router = express.Router();

router.post('/create',auth,policeStationController.createpoliceStation);
router.put('/update/:id',auth,policeStationController.updatepoliceStation);
router.delete('/delete/:id',auth,policeStationController.deletepoliceStation);
router.get('/',auth,policeStationController.getpoliceStations);

export default router;