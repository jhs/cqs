function showList(user, pass, db){
	var url = "http://";
	if(user){
		url += encodeURIComponent(user);
		if(pass) url += ":" + encodeURIComponent(pass);
		url += "@";
	}

	var cqs = require('cqs').defaults({couch: url + "127.0.0.1:5984", "db": db || "cqs_queue"});

	cqs.ListQueues(function(err, queues) {
		if(err) throw err;
		var $list = $("#list");
		$.each(queues, function(i, queue){
			var $li = $("<li>");
			$li.text(queue.name + " ");
			queue.receive(10, function(err, msgs){
				if(err) throw err;
				var $span = $("<span>");
				$span.text(msgs.length);
				$li.append($span);
				var $sublist = $("<ul>");
				$.each(msgs, function(i, msg){
					var $li = $("<li>");
					$li.text(msg.Body);
					$sublist.append($li);
				});
				$li.append($sublist);
			});
			$list.append($li);
		});
	});
}