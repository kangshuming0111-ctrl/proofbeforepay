#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {verifySellerOnboardingKit} from "../lib/seller-onboarding-kit.ts";
if (process.argv.length !== 3) {console.error("Usage: node --experimental-strip-types scripts/verify-seller-kit.mjs /absolute/path/proofbeforepay-seller-kit.zip"); process.exitCode = 2;}
else {try {console.log(JSON.stringify(await verifySellerOnboardingKit(new Uint8Array(await readFile(resolve(process.argv[2])))), null, 2));} catch (error) {console.error(error instanceof Error ? error.message : "seller_kit_verification_failed"); process.exitCode = 1;}}
