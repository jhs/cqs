// Boot the test tool.
//

(function() {
  return require(

         // Options
         { baseUrl: ""
         , paths  : {
                    }
         }

         // Modules
       , [ 'main.js' ]

         // Code to run when ready.
       , function(main) {
           main();
         }
  );
})();
