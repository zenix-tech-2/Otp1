# Mock test for the temp-mail adapters
Runs every provider adapter against simulated responses (no network, no keys needed).

    cd tests/tempmail-mock && node build.js && sed -i "s#require(\"./server\")#require(\"./server.js\")#; s#require(\"./tempmail-core\")#require(\"./tempmail-core.js\")#" tempmail.js && node run.js

Needs `typescript` resolvable from build.js (edit its path to your local install).
