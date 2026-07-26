import { repairMissingShareholding } from "./services/shareholdingRepairService.js";



console.log("Starting shareholding repair...");


repairMissingShareholding()
    .then(() => {
        console.log("Repair finished");
        process.exit(0);
    })
    .catch((error) => {

        console.error(
            "Repair failed:",
            error
        );

        process.exit(1);
    });